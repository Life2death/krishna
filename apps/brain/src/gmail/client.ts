import { readFile } from "node:fs/promises";
import { google } from "googleapis";
import type { GmailTokens } from "./token-store";
import type { Credentials } from "google-auth-library";

const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.send",
];

export function getGmailScopes(): string[] {
  return SCOPES;
}

export interface OAuthKeys {
  installed: {
    client_id: string;
    client_secret: string;
    redirect_uris: string[];
  };
}

export async function loadOAuthKeys(keysPath: string): Promise<OAuthKeys> {
  const raw = await readFile(keysPath, "utf8");
  return JSON.parse(raw) as OAuthKeys;
}

export function createOAuth2Client(keys: OAuthKeys) {
  return new google.auth.OAuth2(
    keys.installed.client_id,
    keys.installed.client_secret,
    keys.installed.redirect_uris[0],
  );
}

function toGmailTokens(creds: Credentials): GmailTokens {
  return {
    access_token: creds.access_token ?? undefined,
    refresh_token: creds.refresh_token!,
    scope: creds.scope ?? undefined,
    token_type: creds.token_type ?? undefined,
    expiry_date: creds.expiry_date ?? undefined,
  };
}

export async function createGmailClient(
  tokens: GmailTokens,
  keys: OAuthKeys,
  onTokenRefresh: (tokens: GmailTokens) => Promise<void>,
) {
  const auth = createOAuth2Client(keys);
  auth.setCredentials(tokens);

  auth.on("tokens", async (newTokens: Credentials) => {
    const updated = toGmailTokens({
      ...tokens,
      ...newTokens,
      refresh_token: newTokens.refresh_token ?? tokens.refresh_token,
    });
    await onTokenRefresh(updated);
  });

  return google.gmail({ version: "v1", auth });
}
