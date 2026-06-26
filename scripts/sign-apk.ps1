<#
  Krishna - APK signing helper (PowerShell)
  -----------------------------------------
  Turns the CI-produced *unsigned* release APK into a signed, installable APK.
  Does everything except the physical install: fetch -> zipalign -> sign -> verify.

  Password handling: this script NEVER stores or hardcodes your keystore password.
    - If $env:ANDROID_KEY_PASSWORD is set, it is passed to apksigner via env: (not echoed).
    - Otherwise apksigner prompts you interactively.

  Usage (from the repo root):
    .\scripts\sign-apk.ps1                      # newest release's unsigned APK
    .\scripts\sign-apk.ps1 -Tag v2.0.4          # a specific tag
    .\scripts\sign-apk.ps1 -ApkPath .\app.apk   # a local APK you already have

  If PowerShell blocks the script, run:
    powershell -ExecutionPolicy Bypass -File .\scripts\sign-apk.ps1
#>
[CmdletBinding()]
param(
  [string]$ApkPath,
  [string]$Tag      = $env:TAG,
  [string]$Repo     = $(if ($env:KRISHNA_REPO) { $env:KRISHNA_REPO } else { "Life2death/krishna" }),
  [string]$Keystore = $(if ($env:KRISHNA_KEYSTORE) { $env:KRISHNA_KEYSTORE } else { Join-Path $HOME "krishna-release.keystore" }),
  [string]$KeyAlias = $env:ANDROID_KEY_ALIAS,
  [string]$OutDir   = "signed-apk"
)
$ErrorActionPreference = "Stop"

function Die($m) { Write-Host "X  $m" -ForegroundColor Red; exit 1 }
function Log($m) { Write-Host ">> $m" -ForegroundColor Yellow }

# --- Locate the Android SDK build-tools (latest) ---
$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { "" }
if (-not $sdk) { Die "ANDROID_HOME (or ANDROID_SDK_ROOT) is not set." }
$btRoot = Join-Path $sdk "build-tools"
if (-not (Test-Path $btRoot)) { Die "No build-tools under $sdk" }
$bt = Get-ChildItem $btRoot -Directory |
      Where-Object { $_.Name -match '^\d+\.\d+\.\d+' } |
      Sort-Object { [version]$_.Name } | Select-Object -Last 1
if (-not $bt) { Die "No build-tools versions found under $btRoot" }
$apksigner = Join-Path $bt.FullName "apksigner.bat"
$zipalign  = Join-Path $bt.FullName "zipalign.exe"
if (-not (Test-Path $apksigner)) { Die "apksigner not found at $apksigner" }
if (-not (Test-Path $zipalign))  { Die "zipalign not found at $zipalign" }
if (-not (Test-Path $Keystore))  { Die "Keystore not found at $Keystore (use -Keystore to override)." }

$work = New-Item -ItemType Directory -Path (Join-Path $env:TEMP ("krishna-sign-" + [guid]::NewGuid().ToString("N")))
try {
  # --- Resolve the input APK ---
  if ($ApkPath) {
    if (-not (Test-Path $ApkPath)) { Die "Input APK not found: $ApkPath" }
    $apkIn = (Resolve-Path $ApkPath).Path
    Log "Using local APK: $apkIn"
  } else {
    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { Die "gh CLI not found - install it, or pass -ApkPath." }
    if (-not $Tag) { $Tag = (gh release list --repo $Repo --limit 1 --json tagName -q ".[0].tagName") }
    if (-not $Tag) { Die "Could not determine latest release tag (pass -Tag vX.Y.Z)." }
    Log "Downloading unsigned APK from release $Tag ..."
    gh release download $Tag --repo $Repo --pattern "*unsigned*.apk" --dir $work.FullName --clobber
    if ($LASTEXITCODE -ne 0) { Die "Download failed (no '*unsigned*.apk' on release $Tag?)." }
    $apkIn = (Get-ChildItem $work.FullName -Filter "*unsigned*.apk" | Select-Object -First 1).FullName
    if (-not $apkIn) { Die "Download succeeded but no unsigned APK was found." }
  }
  $verTag = if ($Tag) { $Tag } else { "local" }

  # --- Align ---
  $aligned = Join-Path $work.FullName "aligned.apk"
  Log "Zip-aligning ..."
  & $zipalign -p -f 4 $apkIn $aligned
  if ($LASTEXITCODE -ne 0) { Die "zipalign failed." }

  # --- Sign ---
  if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir | Out-Null }
  $signed = Join-Path $OutDir "krishna-$verTag-signed.apk"
  $signArgs = @("sign", "--ks", $Keystore)
  if ($KeyAlias) { $signArgs += @("--ks-key-alias", $KeyAlias) }
  if ($env:ANDROID_KEY_PASSWORD) {
    $signArgs += @("--ks-pass", "env:ANDROID_KEY_PASSWORD", "--key-pass", "env:ANDROID_KEY_PASSWORD")
    Log "Signing (password from `$env:ANDROID_KEY_PASSWORD) ..."
  } else {
    Log "Signing - apksigner will prompt for your keystore password ..."
  }
  $signArgs += @("--out", $signed, $aligned)
  & $apksigner @signArgs
  if ($LASTEXITCODE -ne 0) { Die "apksigner sign failed." }

  # --- Verify ---
  Log "Verifying signature ..."
  & $apksigner verify --print-certs $signed | Out-Null
  if ($LASTEXITCODE -ne 0) { Die "Signature verification failed." }

  $size = "{0:N0} MB" -f ((Get-Item $signed).Length / 1MB)
  Write-Host ""
  Write-Host "OK  Signed APK ready: $signed  ($size)" -ForegroundColor Green
  Write-Host ""
  Write-Host "Install on your phone:"
  Write-Host "  1. Copy the .apk to the phone (USB / Drive / email)."
  Write-Host "  2. Settings -> Apps -> Special access -> Install unknown apps -> allow your browser/file manager."
  Write-Host "  3. Tap the .apk -> Install -> open. Grant microphone + notifications on first launch."
  Write-Host "  Or via USB (debugging on):  adb install -r `"$signed`""
}
finally {
  Remove-Item $work.FullName -Recurse -Force -ErrorAction SilentlyContinue
}
