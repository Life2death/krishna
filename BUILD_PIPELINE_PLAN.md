# Krishna Build Pipeline — Agent Handoff Plan

> **For the build agent:** read this top-to-bottom once, then execute **step by step in order**.
> Do NOT skip the prerequisites section — later steps depend on secrets being in place.
> After each phase, run its **Verify** step before moving on.

---

## Current State (2026-06-21)

| Pipeline | Status | File |
|---|---|---|
| Desktop (Windows) | ✅ Exists — fires on `v*` tag | `.github/workflows/release.yml` |
| Android APK/AAB | ✅ Exists — fires on `v*` tag + PRs | `.github/workflows/android.yml` |
| CI (typecheck + tests + Rust check) | ✅ Exists — fires on push/PR to main | `.github/workflows/ci.yml` |

All three workflows are committed. **Nothing will work until the GitHub Secrets are set (Step 1 below).**

---

## Step 0 — Prerequisites (human must do this once)

These cannot be automated — they require access to the GitHub repo settings and a local machine.

### 0a. Generate Android signing keystore (run on any machine with Java installed)

```powershell
keytool -genkey -v -keystore krishna-release.keystore `
  -alias krishna `
  -keyalg RSA -keysize 2048 -validity 10000 `
  -dname "CN=Krishna, OU=Dev, O=Life2death, L=India, S=India, C=IN"
# Choose a strong password when prompted — save it somewhere safe.

# Base64-encode the keystore file
[Convert]::ToBase64String([IO.File]::ReadAllBytes("krishna-release.keystore")) | Set-Clipboard
# This copies the base64 string to clipboard — paste it as the ANDROID_KEYSTORE_BASE64 secret below.
```

### 0b. Add GitHub Secrets

Go to: **GitHub → Life2death/krishna → Settings → Secrets and variables → Actions → New repository secret**

| Secret name | Value |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | base64 output from step 0a |
| `ANDROID_KEY_PASSWORD` | password chosen in step 0a |
| `ANDROID_KEY_ALIAS` | `krishna` |

> `GITHUB_TOKEN` is auto-provided by GitHub Actions — no action needed.

### 0c. Verify the keystore is NOT committed to git

```powershell
# Run locally — should return nothing
git ls-files krishna-release.keystore
```

If it shows up, run: `git rm --cached krishna-release.keystore` and ensure `*.keystore` is in `.gitignore`.

---

## Step 1 — Trigger a CI run (no tag needed)

Push any change to `main` or open a PR. This fires `ci.yml`:

```powershell
git add .
git commit -m "chore: add build pipelines"
git push origin main
```

**Verify:** Go to GitHub → Actions → "CI" workflow → confirm all 3 jobs pass:
- `TypeScript + Vitest` (ubuntu)
- `Rust cargo check` (ubuntu)

---

## Step 2 — Trigger a PR Android smoke test

Open a PR against `main` with any change touching `src-tauri/`, `src/`, or `packages/`. This fires `android.yml` in PR mode (debug APK only — no signing needed).

**Verify:**
- GitHub → Actions → "Android Build & Release" → job completes
- Download the artifact `krishna-debug-<sha>` — confirm it contains a `.apk` file
- (Optional) sideload the APK on a physical Android device or emulator to confirm it launches

---

## Step 3 — Trigger a full release (desktop + Android)

```powershell
# Bump version first in both places:
# 1. src-tauri/tauri.conf.json → "version"
# 2. src-tauri/Cargo.toml     → version = "..."
# Then:
git add src-tauri/tauri.conf.json src-tauri/Cargo.toml
git commit -m "chore: bump version to v1.0.4"
git tag v1.0.4
git push origin main --tags
```

This fires **both** workflows in parallel:
- `release.yml` → builds Windows `.msi` + `.exe` → creates GitHub Release draft
- `android.yml` → builds signed `.apk` + `.aab` → uploads to the same Release draft

**Verify:**
- GitHub → Releases → `v1.0.4` draft appears
- Assets include: Windows installer (`.msi` or `.exe`) + `*.apk` + `*.aab`
- Publish the draft manually after inspecting the assets

---

## Step 4 — Distribute the Android APK

### Option A: Direct sideload (immediate, no Play Store)
1. Download the `.apk` from the GitHub Release
2. Transfer to Android device
3. Enable "Install from unknown sources" in Android settings
4. Install the APK

### Option B: Google Play (later)
- The `.aab` (Android App Bundle) is what Play Store requires
- Upload to Play Console → Internal Testing track first
- Requires a Google Play Developer account ($25 one-time)

---

## Workflow File Reference

### `.github/workflows/android.yml` — what it does

| Trigger | Build type | Signing | Output |
|---|---|---|---|
| Pull request | Debug APK | Unsigned | Artifact (7-day retention) |
| `v*` tag push | Release APK + AAB | Signed (keystore) | GitHub Release draft |

**Android build matrix:** compiles Rust for all 4 Android ABIs:
- `aarch64-linux-android` (modern 64-bit phones)
- `armv7-linux-androideabi` (older 32-bit phones)
- `i686-linux-android` (x86 emulator)
- `x86_64-linux-android` (x86_64 emulator)

**NDK version:** `28.2.13676358` (matches local dev setup)

**APK output path:** `src-tauri/gen/android/app/build/outputs/apk/universal/release/`

### `.github/workflows/release.yml` — what it does

Builds Windows desktop app on `windows-latest` via `tauri-apps/tauri-action`. Produces:
- `.msi` (Windows Installer)
- `.exe` (NSIS installer)

### `.github/workflows/ci.yml` — what it does

| Job | Runner | Checks |
|---|---|---|
| `TypeScript + Vitest` | ubuntu-latest | `tsc --noEmit` + `npm test` (192 tests) |
| `Rust cargo check` | ubuntu-latest | `cargo check --workspace` in `src-tauri/` |

---

## Troubleshooting Guide

### Android build fails: "NDK not found"
- Confirm NDK version `28.2.13676358` matches what's installed in the workflow `sdkmanager` step
- The env vars `NDK_HOME` and `ANDROID_NDK_HOME` must point to the NDK — both are set in the workflow

### Android build fails: "keystore not found" or signing error
- Confirm all 3 secrets are set in GitHub Settings
- Confirm `ANDROID_KEYSTORE_BASE64` is a valid base64 string (no newlines)
- Re-encode: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("krishna-release.keystore"))`

### Android APK path not found (artifact upload fails)
- The APK output path depends on build flavor. Check actual path in the Gradle build logs.
- Default path: `src-tauri/gen/android/app/build/outputs/apk/universal/release/`
- Debug path: `src-tauri/gen/android/app/build/outputs/apk/universal/debug/`

### Desktop release.yml fails: Rust compile error
- Run locally: `cd src-tauri && cargo build --release`
- The workflow uses `windows-latest` — Windows-specific Tauri APIs (`xcap`, screen capture) are gated with `#[cfg(not(target_os = "android"))]` — verify those guards are in place

### CI Rust check fails on Linux
- Linux needs GTK/WebKit system deps — they are installed in the workflow's "Install system deps" step
- If a new Tauri plugin is added, its Linux deps may need to be added there too

---

## Open Items (not blocking the pipeline)

- [ ] **iOS pipeline**: deferred — requires macOS runner + Apple Developer account ($99/yr) + provisioning profile secrets. Template: use `macos-latest` runner, add `xcode-select` setup, run `npx tauri ios build`.
- [ ] **Auto-publish to Play Store**: use `r0adkll/upload-google-play` action after the AAB build. Requires `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON` secret.
- [ ] **Auto-increment `versionCode`**: Android `versionCode` must increase monotonically for Play Store. Consider deriving it from `github.run_number` in the workflow.
- [ ] **Updater**: `tauri.conf.json` has `createUpdaterArtifacts: false` — enable and add `TAURI_SIGNING_PRIVATE_KEY` secret to get auto-update support in the desktop app.
