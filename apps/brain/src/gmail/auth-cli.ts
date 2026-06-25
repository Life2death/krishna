import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadMasterKey } from "../crypto/keyring.ts";
import { makeFieldCrypto } from "../crypto/field-crypto.ts";
import { loadOAuthKeys, createOAuth2Client, getGmailScopes } from "./client.ts";
import { saveToken } from "./token-store.ts";

const OAUTH_KEYS_PATH = process.env.KRISHNA_GMAIL_OAUTH_KEYS_PATH;
const TOKEN_PATH = process.env.KRISHNA_GMAIL_TOKEN_PATH ?? resolve(import.meta.dirname!, "../../.gmail-token.enc");

async function main() {
  if (!OAUTH_KEYS_PATH) {
    console.error("Missing KRISHNA_GMAIL_OAUTH_KEYS_PATH env. Set it to the path of your OAuth client JSON.");
    process.exit(1);
  }

  const keys = await loadOAuthKeys(OAUTH_KEYS_PATH);
  const oauth2Client = createOAuth2Client(keys);

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: getGmailScopes(),
    prompt: "consent",
  });

  console.log("\\nAuthorize Gmail access by visiting this URL:");
  console.log("\\n  " + authUrl + "\\n");

  const code = await new Promise<string>((resolve, reject) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url!, "http://localhost");
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Authorization denied: " + error);
        reject(new Error("Authorization denied: " + error));
        return;
      }

      if (code) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful! You can close this window.");
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No authorization code found.");
        reject(new Error("No authorization code found in callback"));
      }
    });

    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as any).port;
      console.log("Waiting for authorization callback on http://127.0.0.1:" + port + " ...");
    });
  });

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token) {
    console.error("No refresh_token returned. Ensure 'prompt: consent' was used and the account is a test user.");
    process.exit(1);
  }

  const crypto = makeFieldCrypto(await loadMasterKey());
  await saveToken(
    {
      access_token: tokens.access_token!,
      refresh_token: tokens.refresh_token!,
      scope: tokens.scope ?? getGmailScopes().join(" "),
      token_type: tokens.token_type ?? "Bearer",
      expiry_date: tokens.expiry_date ?? undefined,
    },
    TOKEN_PATH,
    crypto,
  );

  console.log("\\nGmail authorized (read-only + send). Token saved encrypted to " + TOKEN_PATH);
}

main().catch((err) => {
  console.error("Gmail auth failed:", err);
  process.exit(1);
});
