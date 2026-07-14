# Session: wake-word meter + settings + 16 KB fix

**Branch:** eat/wakeword-litert (pushed to origin)
**Date:** 2026-07-14

## ? Completed

### Task 1 — Confidence meter (WakeWordMeter.tsx)
- New component at src/pages/mobile/components/WakeWordMeter.tsx
- Polls invoke("android_get_wake_word_detector_state") every 400ms
- Renders score bar + detectorState label; shows em-dash when no score; handles modelAvailable:false
- Guarded with isMobileDevice() + try/catch
- Mounted in Home.tsx shell (visible in both Classic + Live modes)

### Task 2 — Settings discoverable on mobile
- Settings.tsx: renders WakeWordMeter + WakeWordSettings + Classic wake-word phrase input (bound to useKrishna().wakeWord/setWakeWord)

### Task 3 — 16 KB page-size fix (code changes)
- build.gradle.kts: swapped org.tensorflow:tensorflow-lite:2.14.0 -> com.google.ai.edge.litert:litert:1.4.2, tensorflow-lite-support:0.4.4 -> litert-support:1.4.2
- OpenWakeWordDetector.kt + WakeWordEvaluator.kt: imports updated to com.google.ai.edge.litert.*
- LiteRT 1.4.2 + deps cached in ~/.gradle/caches/

### Verification passed
- npx tsc --noEmit -- green
- npx vite build -- green

## ? Pending

### 16 KB alignment verification (APK not yet built)
The gradle assemble step fails at :app:rustBuildArm64Debug because tauri android android-studio-script expects a WebSocket server (started by tauri dev). Not a code issue -- just a CI/build-environment problem.

Fix: build Rust lib separately first, then run gradle:
    cd src-tauri
    cargo build --target aarch64-linux-android -p krishna --release
    cd ..\src-tauri\gen\android
    .\gradlew.bat :app:assembleUniversalDebug -PabiList=arm64-v8a -ParchList=arm64 -PtargetList=aarch64 --offline --console=plain

Then verify .so alignment with llvm-readelf (expect 0x4000).

### Rust compilation
cargo build was killed mid-way; next run will be faster with cached deps.

### TypeScript tests
npx vitest run not yet attempted.

## Files changed
| File | Status |
|------|--------|
| src/pages/mobile/components/WakeWordMeter.tsx | NEW |
| src/pages/mobile/Home.tsx | Modified |
| src/pages/mobile/Settings.tsx | Modified |
| src-tauri/gen/android/app/build.gradle.kts | Modified |
| src-tauri/.../OpenWakeWordDetector.kt | Modified |
| src-tauri/.../WakeWordEvaluator.kt | Modified |
| src/lib/actions.ts | Pre-existing change (included) |
