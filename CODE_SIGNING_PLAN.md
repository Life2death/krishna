# Code-Signing Plan (Track 5)

Goal: produce signed Windows installers so SmartScreen doesn't block installs on clean machines.

## Option A: Import a .pfx Certificate (Simple)

Use if you have an existing code-signing `.pfx` file (e.g. from Sectigo, DigiCert, or the cert used for v2.0.0).

### Steps

1. **Encode the .pfx to base64**:
   ```powershell
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\certificate.pfx")) | Set-Content cert_base64.txt
   ```

2. **Add GitHub secrets**:
   - `WINDOWS_CERTIFICATE` — the base64 string from above
   - `WINDOWS_CERTIFICATE_PASSWORD` — the PFX export password

3. **Configure `tauri.conf.json`** — uncomment the `windows` section under `bundle`:

   ```json
   "bundle": {
     "windows": {
       "certificateThumbprint": "<SHA1 thumbprint shown after import>",
       "digestAlgorithm": "sha256",
       "timestampUrl": "http://timestamp.digicert.com"
     }
   }
   ```

   Find the thumbprint after importing:
   ```powershell
   Import-PfxCertificate -FilePath certificate.pfx -CertStoreLocation Cert:\CurrentUser\My
   Get-ChildItem Cert:\CurrentUser\My | Where-Object { $_.Subject -match "Krishna" }
   # Copy the Thumbprint property
   ```

4. **CI workflow** (`release.yml`) already has the import step (see below). Push a tag to test.

---

## Option B: Azure Key Vault (Recommended for CI)

Use if you want to avoid storing the .pfx in GitHub Secrets. Requires an Azure subscription.

### Prerequisites

- Azure CLI (`az`) installed locally
- Azure subscription with permissions to create Key Vaults

### Setup

1. **Create a Key Vault** and import/generate a certificate:
   ```bash
   az keyvault create --name krishna-codesign --resource-group krishna-rg --location westus2
   az keyvault certificate create --vault-name krishna-codesign --name krishna-signing --policy @policy.json
   ```

2. **Create an App Registration** in Microsoft Entra ID:
   - Go to Entra ID → App registrations → New registration
   - Note the Application (client) ID and Directory (tenant) ID
   - Create a client secret, note the value

3. **Assign RBAC roles** on the Key Vault:
   ```bash
   az role assignment create --assignee <app-client-id> --role "Key Vault Certificate User" --scope <key-vault-id>
   az role assignment create --assignee <app-client-id> --role "Key Vault Crypto User" --scope <key-vault-id>
   ```

4. **Edit `src-tauri/relic.conf`** with your vault/certificate names.

5. **Add GitHub secrets**:
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_SECRET`

6. **Uncomment the relic config** in `tauri.conf.json` → `bundle.windows.signCommand`

---

## Option C: Azure Trusted Signing (Microsoft Managed)

Newest option from Microsoft. Uses Azure Artifact Signing service.

### Setup

1. Install the signing CLI:
   ```bash
   cargo install artifact-signing-cli
   ```

2. Configure Azure Trusted Signing in the Azure Portal:
   - Search for "Trusted Signing" → Create
   - Note the Account Name, Certificate Profile Name, and Endpoint URL

3. **Uncomment the Trusted Signing config** in `tauri.conf.json` → `bundle.windows.signCommand`

4. **Add GitHub secrets** (same as Option B):
   - `AZURE_CLIENT_ID`
   - `AZURE_TENANT_ID`
   - `AZURE_CLIENT_SECRET`

---

## Local Signing (Testing)

For signing builds on your own machine, use `scripts/sign-windows.ps1`:

```powershell
.\scripts\sign-windows.ps1 -InstallerPath .\Krishna_2.1.0_x64-setup.exe -CertificatePath .\certificate.pfx
```

---

## Release Workflow

After signing is configured:

1. Bump version in `src-tauri/tauri.conf.json`
2. Commit and push a tag:
   ```bash
   git tag v2.1.0
   git push origin v2.1.0
   ```
3. GitHub Actions builds, signs, and creates a draft release
4. Test the installer on a clean VM
5. Publish the release on GitHub

---

## Checking if a Binary is Signed

```powershell
Get-AuthenticodeSignature .\Krishna_2.1.0_x64-setup.exe
```
Expected output includes `SignerCertificate` with a valid chain and `Status: Valid`.
