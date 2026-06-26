<#
.SYNOPSIS
  Sign a Windows installer (or any PE) with an Authenticode certificate.
.DESCRIPTION
  Signs the given installer using the specified .pfx certificate.
  Falls back to signtool.exe (Windows SDK) on the PATH.
.PARAMETER InstallerPath
  Path to the installer or binary to sign.
.PARAMETER CertificatePath
  Path to the .pfx certificate file.
.PARAMETER TimestampUrl
  Timestamp server URL (default: DigiCert).
.EXAMPLE
  .\sign-windows.ps1 -InstallerPath .\Krishna_2.1.0_x64-setup.exe -CertificatePath .\certificate.pfx
#>
param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath,
  [Parameter(Mandatory = $true)]
  [string]$CertificatePath,
  [string]$TimestampUrl = "http://timestamp.digicert.com"
)

if (-not (Test-Path $InstallerPath)) {
  Write-Error "Installer not found: $InstallerPath"
  exit 1
}
if (-not (Test-Path $CertificatePath)) {
  Write-Error "Certificate not found: $CertificatePath"
  exit 1
}

# Find signtool.exe (Windows SDK)
$signtool = Get-Command "signtool.exe" -ErrorAction SilentlyContinue
if (-not $signtool) {
  $possiblePaths = @(
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe",
    "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x86\signtool.exe",
    "${env:ProgramFiles}\Microsoft SDKs\Windows\v*\Bin\signtool.exe"
  )
  foreach ($pattern in $possiblePaths) {
    $matches = Resolve-Path $pattern -ErrorAction SilentlyContinue
    if ($matches) {
      $signtool = $matches[-1].Path
      break
    }
  }
}

if (-not $signtool) {
  Write-Error "signtool.exe not found. Install Windows SDK or add it to PATH."
  exit 1
}

$signtoolPath = if ($signtool -is [System.Management.Automation.CommandInfo]) { $signtool.Source } else { $signtool }

Write-Host "Signing: $InstallerPath" -ForegroundColor Cyan
Write-Host "Using:   $signtoolPath" -ForegroundColor Cyan

# Prompt for PFX password
$securePwd = Read-Host "Enter certificate password" -AsSecureString
$ptr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePwd)
$plainPwd = [System.Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
[System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)

& $signtoolPath sign /fd sha256 /f $CertificatePath /p $plainPwd /tr $TimestampUrl /td sha256 /v $InstallerPath

if ($LASTEXITCODE -eq 0) {
  Write-Host "✓ Signed successfully" -ForegroundColor Green
  Get-AuthenticodeSignature $InstallerPath | Format-List Status, SignerCertificate
} else {
  Write-Error "Signing failed (exit code: $LASTEXITCODE)"
  exit $LASTEXITCODE
}
