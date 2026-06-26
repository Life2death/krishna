#!/usr/bin/env bash
#
# Krishna — APK signing helper
# -----------------------------
# Turns the CI-produced *unsigned* release APK into a signed, installable APK.
# Does everything except the physical install: fetch -> zipalign -> sign -> verify.
#
# Password handling: this script NEVER stores or hardcodes your keystore password.
#   - If $ANDROID_KEY_PASSWORD is set, it is passed to apksigner via `env:` (not echoed).
#   - Otherwise apksigner prompts you interactively.
#
# Usage:
#   scripts/sign-apk.sh                    # download newest release's unsigned APK, sign it
#   TAG=v2.0.4 scripts/sign-apk.sh         # download a specific tag's unsigned APK, sign it
#   scripts/sign-apk.sh path/to/app.apk    # sign a local APK you already have
#
# Optional env overrides:
#   KRISHNA_KEYSTORE   path to keystore   (default: $HOME/krishna-release.keystore)
#   ANDROID_KEY_ALIAS  key alias          (default: auto — apksigner picks the sole key)
#   ANDROID_KEY_PASSWORD  keystore/key password (default: prompt interactively)
#   KRISHNA_REPO       owner/repo         (default: Life2death/krishna)
#   OUT_DIR            output folder      (default: ./signed-apk)
#
set -euo pipefail

KEYSTORE="${KRISHNA_KEYSTORE:-$HOME/krishna-release.keystore}"
KEY_ALIAS="${ANDROID_KEY_ALIAS:-}"
REPO="${KRISHNA_REPO:-Life2death/krishna}"
OUT_DIR="${OUT_DIR:-./signed-apk}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

log()  { printf '\033[1;33m▸ %s\033[0m\n' "$*"; }
die()  { printf '\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

# ── Locate the Android SDK build-tools (latest) ──────────────────────────────
SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}"
SDK="${SDK//\\//}"                         # normalize Windows backslashes for Git Bash
[ -n "$SDK" ] || die "ANDROID_HOME (or ANDROID_SDK_ROOT) is not set."
BT="$(ls -d "$SDK/build-tools/"*/ 2>/dev/null | sort -V | tail -1)"; BT="${BT%/}"
[ -n "$BT" ] || die "No build-tools found under $SDK/build-tools."

case "$(uname -s)" in
  MINGW*|MSYS*|CYGWIN*) APKSIGNER="$BT/apksigner.bat"; ZIPALIGN="$BT/zipalign.exe" ;;
  *)                    APKSIGNER="$BT/apksigner";     ZIPALIGN="$BT/zipalign"     ;;
esac
[ -x "$ZIPALIGN" ] || [ -f "$ZIPALIGN" ] || die "zipalign not found at $ZIPALIGN"
[ -f "$APKSIGNER" ] || die "apksigner not found at $APKSIGNER"
[ -f "$KEYSTORE" ]  || die "Keystore not found at $KEYSTORE (set KRISHNA_KEYSTORE to override)."

# ── Resolve the input APK (local arg, or download the unsigned release asset) ─
INPUT="${1:-}"
if [ -n "$INPUT" ]; then
  [ -f "$INPUT" ] || die "Input APK not found: $INPUT"
  log "Using local APK: $INPUT"
else
  command -v gh >/dev/null || die "gh CLI not found — install it, or pass a local APK path."
  TAG="${TAG:-$(gh release list --repo "$REPO" --limit 1 --json tagName -q '.[0].tagName' 2>/dev/null)}"
  [ -n "$TAG" ] || die "Could not determine latest release tag (pass TAG=vX.Y.Z)."
  log "Downloading unsigned APK from release $TAG …"
  gh release download "$TAG" --repo "$REPO" --pattern '*unsigned*.apk' --dir "$WORK" --clobber \
    || die "No '*unsigned*.apk' asset on release $TAG."
  INPUT="$(ls "$WORK"/*unsigned*.apk 2>/dev/null | head -1)"
  [ -n "$INPUT" ] || die "Download succeeded but no unsigned APK was found."
fi

VER_TAG="${TAG:-local}"

# ── Align ────────────────────────────────────────────────────────────────────
ALIGNED="$WORK/aligned.apk"
log "Zip-aligning …"
"$ZIPALIGN" -p -f 4 "$INPUT" "$ALIGNED"

# ── Sign ─────────────────────────────────────────────────────────────────────
mkdir -p "$OUT_DIR"
SIGNED="$OUT_DIR/krishna-${VER_TAG}-signed.apk"

SIGN_ARGS=(sign --ks "$KEYSTORE")
[ -n "$KEY_ALIAS" ] && SIGN_ARGS+=(--ks-key-alias "$KEY_ALIAS")
if [ -n "${ANDROID_KEY_PASSWORD:-}" ]; then
  SIGN_ARGS+=(--ks-pass "env:ANDROID_KEY_PASSWORD" --key-pass "env:ANDROID_KEY_PASSWORD")
  log "Signing (password from \$ANDROID_KEY_PASSWORD) …"
else
  log "Signing — apksigner will prompt for your keystore password …"
fi
SIGN_ARGS+=(--out "$SIGNED" "$ALIGNED")
"$APKSIGNER" "${SIGN_ARGS[@]}"

# ── Verify ───────────────────────────────────────────────────────────────────
log "Verifying signature …"
"$APKSIGNER" verify --print-certs "$SIGNED" >/dev/null && printf '\033[1;32m✓ valid signature\033[0m\n'

SIZE="$(du -h "$SIGNED" | cut -f1)"
printf '\n\033[1;32m✓ Signed APK ready:\033[0m %s  (%s)\n\n' "$SIGNED" "$SIZE"
cat <<'NEXT'
Install on your phone:
  1. Copy the signed .apk to the phone (USB, Drive, or email).
  2. Phone → Settings → Apps → Special access → Install unknown apps → allow your browser/file manager.
  3. Tap the .apk → Install → open. Grant microphone + notification permissions on first launch.

  Or, if the phone is USB-connected with USB debugging on:
     adb install -r "PATH_TO_SIGNED_APK"
NEXT
