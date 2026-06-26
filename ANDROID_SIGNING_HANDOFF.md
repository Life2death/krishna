# Agent Handoff — Make CI produce a SIGNED, installable Android APK

> **For the implementing agent.** The Android build now succeeds (v2.0.4), but it emits
> `app-universal-release-unsigned.apk` — Android refuses to install unsigned APKs, so the artifact
> is not sideloadable. The three signing secrets already exist on GitHub
> (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), and
> `src-tauri/gen/android/app/build.gradle.kts` IS committed. The Gradle signing config just isn't
> wired to those secrets. Wire it so tagged builds yield a signed, installable APK.

## Current state (verified)
- `gh secret list` → `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` all set.
- `.github/workflows/android.yml` already has a **Decode keystore** step that writes
  `$RUNNER_TEMP/release.keystore` and passes `TAURI_SIGNING_ANDROID_*` env vars — but the release APK
  comes out `*-unsigned.apk`, i.e. Gradle has no `signingConfig` applied to the release build type.
- `src-tauri/gen/android/app/build.gradle.kts` is tracked in git → editable directly.

## Fix — two parts

### Part 1 — `src-tauri/gen/android/app/build.gradle.kts`: add a release signingConfig
Read the current file first (don't blind-overwrite — Tauri generates specific contents). Add a
`keystore.properties` loader near the top and a `signingConfigs` block, then attach it to the
`release` build type:

```kotlin
import java.io.FileInputStream
import java.util.Properties

val keystorePropertiesFile = rootProject.file("keystore.properties")
val keystoreProperties = Properties()
if (keystorePropertiesFile.exists()) {
    keystoreProperties.load(FileInputStream(keystorePropertiesFile))
}

android {
    // ...existing config...

    signingConfigs {
        create("release") {
            if (keystorePropertiesFile.exists()) {
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
                storeFile = file(keystoreProperties["storeFile"] as String)
                storePassword = keystoreProperties["storePassword"] as String
            }
        }
    }

    buildTypes {
        getByName("release") {
            // keep Tauri's existing release config (minify, proguard, etc.)
            signingConfig = signingConfigs.getByName("release")
        }
    }
}
```

> `rootProject.file("keystore.properties")` resolves to `src-tauri/gen/android/keystore.properties`.
> Do **not** commit a real `keystore.properties` — it's written at CI time (Part 2) and should be
> gitignored. Add `src-tauri/gen/android/keystore.properties` to `.gitignore` if not already covered.

### Part 2 — `.github/workflows/android.yml`: write `keystore.properties` before the release build
Extend the existing **Decode keystore** step (the tag-gated one) so it also writes the properties
file the Gradle config reads:

```yaml
      - name: Decode keystore + write signing config
        if: github.event_name == 'push' && startsWith(github.ref, 'refs/tags/')
        run: |
          echo "${{ secrets.ANDROID_KEYSTORE_BASE64 }}" | base64 --decode > $RUNNER_TEMP/release.keystore
          cat > src-tauri/gen/android/keystore.properties <<EOF
          storeFile=$RUNNER_TEMP/release.keystore
          keyAlias=${{ secrets.ANDROID_KEY_ALIAS }}
          keyPassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          storePassword=${{ secrets.ANDROID_KEY_PASSWORD }}
          EOF
```
(The `TAURI_SIGNING_ANDROID_*` env vars on the build step can stay or be removed — the Gradle
`signingConfig` is what actually signs the APK now.)

### Part 3 — Upload the signed name
The release-upload step globs `.../release/*.apk`. Once signed, Gradle outputs
`app-universal-release.apk` (no `-unsigned` suffix). Confirm the upload glob still matches (it uses
`*.apk`, so it will) and that the **unsigned** apk is no longer produced alongside it (if both exist,
tighten the glob to exclude `*-unsigned.apk`).

## Verify
1. Cut a new tag (e.g. `v2.0.5`). The Android release build runs.
2. The release asset is `app-universal-release.apk` (NOT `-unsigned`).
3. Download it to an Android phone → it installs (no "package invalid" error).
4. `apksigner verify app-universal-release.apk` (or check on-device install) confirms a valid signature.
5. Desktop release still builds unaffected.

## Notes
- The keystore is the same `krishna-release.keystore` whose base64 is in `ANDROID_KEYSTORE_BASE64`.
  Keep the keystore + passwords out of the repo — only the GitHub secrets and the CI-written
  `keystore.properties` (ephemeral, gitignored) hold them.
- This does not touch the AAB (Play Store path) — that's separately signed/uploaded if Play
  credentials are configured.
- After this lands, sideloading is: download `app-universal-release.apk` from the release on the
  phone → enable "install unknown apps" for the browser → tap → install.
