import { createServer } from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { google } from "googleapis";
import { loadMasterKey } from "../crypto/keyring.ts";
import { makeFieldCrypto } from "../crypto/field-crypto.ts";
import { loadOAuthKeys, getGmailScopes } from "./client.ts";
import { saveToken } from "./token-store.ts";

const OAUTH_KEYS_PATH = process.env.KRISHNA_GMAIL_OAUTH_KEYS_PATH;
const TOKEN_PATH = process.env.KRISHNA_GMAIL_TOKEN_PATH ?? resolve(import.meta.dirname!, "../../.gmail-token.enc");

async function main() {
  if (!OAUTH_KEYS_PATH) {
    console.error("Missing KRISHNA_GMAIL_OAUTH_KEYS_PATH env. Set it to the path of your OAuth client JSON.");
    process.exit(1);
  }

  const keys = await loadOAuthKeys(OAUTH_KEYS_PATH);

  // 1. Start local callback server on a random loopback port first
  const { server, port } = await new Promise<{ server: ReturnType<typeof createServer>; port: number }>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address() as any;
      console.log("Callback server listening on http://127.0.0.1:" + addr.port);
      resolve({ server: srv, port: addr.port });
    });
    srv.on("error", reject);
  });

  // 2. Create the OAuth2 client with the actual redirect URI (loopback + port)
  const redirectUri = `http://127.0.0.1:${port}`;
  const oauth2Client = new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    redirectUri,
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    scope: getGmailScopes(),
    prompt: "consent",
  });

  console.log("\nAuthorize Gmail access by visiting this URL:");
  console.log("\n  " + authUrl + "\n");

  // 3. Wait for the OAuth callback — one-shot handler, then close
  const code = await new Promise<string>((resolve, reject) => {
    server.once("request", (req, res) => {
      const url = new URL(req.url!, "http://127.0.0.1");
      const c = url.searchParams.get("code");
      const err = url.searchParams.get("error");

      if (err) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Authorization denied: " + err);
        server.close();
        reject(new Error("Authorization denied: " + err));
        return;
      }

      if (c) {
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("Authorization successful! You can close this window.");
        server.close();
        resolve(c);
      } else {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No authorization code found.");
      }
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

  console.log("\nGmail authorized (read-only + send). Token saved encrypted to " + TOKEN_PATH);
}

main().catch((err) => {
  console.error("Gmail auth failed:", err);
  process.exit(1);
});
