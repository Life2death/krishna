# Android fast build & deploy (arm64-only, fully offline)

Verified working end-to-end 2026-07-13: Rust gate ~5 min, frontend build ~6 min, APK build under a
minute, installed and launched clean on `R9ZY40XK38A`. **Anyone following these exact steps should
get the same result.** Use this document — don't reinvent the recipe per session.

## Why this exists

Prior sessions lost 3-4 hours per attempt with builds that "ran for an hour with no APK." The root
cause was never a compile error — it was two silent, unbounded network stalls:

1. **`cargo` blocks on the crates.io index with no timeout.** When the network is even slightly
   unreliable, cargo sits at ~0.5% CPU with no `rustc` child process and no visible error —
   indistinguishable from "still compiling" for as long as you leave it.
2. **`tauri android build`'s `beforeBuildCommand` (`npm run build`) runs a `prebuild` hook**
   (`fetch:voiceid`, downloads the WavLM voice-ID model) **that hits the Hugging Face API with no
   timeout, even when the model file already exists on disk.** If HF is slow, the whole build hangs
   in the frontend step before gradle ever starts.

The fix is to force every step offline and to bypass `tauri android build` in favor of driving
gradle directly (it never re-triggers the frontend hook).

## Prerequisites (one-time machine setup)

- NDK `28.2.13676358` installed under `%ANDROID_HOME%\ndk\`
- Rust android targets installed: `rustup target add aarch64-linux-android`
- `JAVA_HOME` pointing at a JDK 17+ (Android Studio's bundled `jbr` works: `C:\Program Files\Android Studio\jbr`)
- Windows Defender exclusions on the project dir, `~/.cargo`, `rustc.exe`, `cargo.exe` (see
  [[android-jni-and-build-speed]] memory — without this, rustc runs at ~20% efficiency)
- `src-tauri/Cargo.toml` has `[profile.dev] debug = 0, strip = "debuginfo"` — do not remove this,
  it roughly halves APK size and Defender scan time
- Voice-ID model already fetched once (`public/models/Xenova/wavlm-base-plus-sv/`) so the frontend
  build never needs network. If it's missing, run `npm run fetch:voiceid` once online before using
  this offline recipe.
- A device connected and authorized: `adb devices` shows it as `device` (not `unauthorized`)

## The four steps

Run each from PowerShell. Substitute your NDK path if it differs.

### 0. Set the build environment (every session)

```powershell
$env:ANDROID_HOME = "C:\Users\<you>\AppData\Local\Android\Sdk"
$env:NDK_HOME      = "$env:ANDROID_HOME\ndk\28.2.13676358"
$env:JAVA_HOME     = "C:\Program Files\Android\Android Studio\jbr"
$NDKBIN = "$env:NDK_HOME\toolchains\llvm\prebuilt\windows-x86_64\bin"
$env:CC_aarch64_linux_android  = "$NDKBIN\aarch64-linux-android24-clang.cmd"
$env:CXX_aarch64_linux_android = "$NDKBIN\aarch64-linux-android24-clang++.cmd"
$env:AR_aarch64_linux_android  = "$NDKBIN\llvm-ar.exe"
$env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = "$NDKBIN\aarch64-linux-android24-clang.cmd"
$env:CARGO_NET_OFFLINE = "true"
```

### 1. Fast Rust gate (catches real Rust errors in minutes, not an hour)

```powershell
cd src-tauri
cargo check --target aarch64-linux-android -p krishna --offline
```

Fails fast on genuine compile errors. Warnings are fine. `Finished ... in Nm Ns` with exit 0 means
the native layer is sound — worth running before touching gradle at all.

### 2. Frontend build (skips the network-fetching prebuild hook)

```powershell
cd D:\Learning\krishna
npx vite build
```

Use `npx vite build` directly, **not** `npm run build`. `npm run build` runs the `prebuild` script
(`fetch:voiceid`) even when nothing needs re-fetching — `npx vite build` skips straight to the
actual bundler and produces the same `dist/` the Rust layer embeds.

### 3. APK build — arm64-only, offline, direct gradle (not `tauri android build`)

```powershell
cd src-tauri\gen\android
.\gradlew.bat :app:assembleUniversalDebug `
  -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 `
  --offline --console=plain --stacktrace
```

This resolves to `app/build/outputs/apk/universal/debug/app-universal-debug.apk`. It's arm64-only
by design — this repo's sherpa-onnx `.so` libraries are arm64-v8a only, so building the other 3
ABIs (`armeabi-v7a`/`x86`/`x86_64`) wastes time for an APK you can't use on a real phone anyway.

**Do not use `npx tauri android build --debug` for iteration.** It re-runs `beforeBuildCommand`
(`npm run build`, the network-fetch hook) on every invocation. The gradle rust-plugin task it
ultimately calls (`tauri android android-studio-script`) only recompiles the Rust dylib — no
frontend rebuild, no network — so driving gradle directly is both faster and hang-proof.

### 4. Install, launch, and verify on-device

```powershell
$adb = "$env:ANDROID_HOME\platform-tools\adb.exe"
$apk = "src-tauri\gen\android\app\build\outputs\apk\universal\debug\app-universal-debug.apk"
& $adb devices                                    # confirm device shows "device"
& $adb install -r $apk
& $adb shell am force-stop com.krishna.assistant
& $adb logcat -c
& $adb shell am start -n com.krishna.assistant/.MainActivity
```

Verify it actually came up (installing ≠ working):

```powershell
& $adb shell pidof com.krishna.assistant                                   # process alive?
& $adb shell "run-as com.krishna.assistant cat cache/krishna-startup.txt"  # want "...started successfully"
& $adb shell "run-as com.krishna.assistant cat cache/krishna-crash.txt"    # should be "No such file"
& $adb logcat -b crash -d -t 20                                            # should be empty
```

To visually confirm the UI, capture on-device then pull (binary-safe) — **do not** use
`adb exec-out screencap -p > file.png` from PowerShell; `>` redirection mangles binary output
(UTF-16 BOM corruption):

```powershell
& $adb shell screencap -p /sdcard/launch.png
& $adb pull /sdcard/launch.png .\launch.png
& $adb shell rm /sdcard/launch.png
```

## Gotchas that will cost you time if you skip them

- **Cargo.toml lives in `src-tauri/`, not the repo root** — running `cargo check` from the repo
  root fails with "could not find Cargo.toml."
- **PowerShell's `Start-Process -FilePath "npx"` fails** ("not a valid Win32 application") — use
  `npx.cmd`/`gradlew.bat` explicitly when scripting, or just call them directly in the foreground.
- **`-ExecutionPolicy Bypass` on a wrapper script gets blocked by the auto-mode permission
  classifier** — inline the commands instead of wrapping them in a `.ps1` invoked with a bypass
  flag.
- **Before starting any build, check for stray `cargo`/`rustc`/`java`/`gradle` processes**
  (`Get-Process cargo,rustc,java -ErrorAction SilentlyContinue`). A killed build leaves orphans
  holding the `target/` directory file lock — the next build silently hangs on "Blocking waiting
  for file lock" with no other symptom.
- **"N busy Daemons could not be reused"** in gradle output is harmless — it just means old
  gradle daemons (from prior killed/crashed builds) are stale; a fresh one spawns automatically.
- **A cargo process sitting at near-0% CPU with no `rustc`/`clang` children for more than ~30
  seconds is stalled, not slow.** Don't wait an hour to find out — check `Get-Process
  cargo,rustc,clang` for children; if there are none and no network connection either, kill it and
  re-run with `--offline`.

## When you'd need the slower path instead

- **Release/signed builds** still need `npx tauri android build --release` (or the GitHub Actions
  release workflow) — this fast recipe is for debug/dev iteration only.
- **First-time setup on a machine** (no warm `target/` dir, no gradle cache) will be slower
  regardless — the offline flags remove the *network stall*, not compile time itself.
- **When `dist/` or the voice-ID model genuinely need a fresh fetch**, run the normal `npm run
  build` (or `npm run fetch:voiceid`) once online first, then switch back to this offline recipe
  for every subsequent iteration.

## Apply this recipe at every future Android deployment step

Any task, stage, or plan in this repo that requires building and deploying an app to an Android
device — not just this session's OpenWakeWord work — should follow this document rather than
re-deriving the steps. If you hit a build issue this document doesn't cover, fix it, then **update
this document**, not just your own task notes, so the fix carries forward.
