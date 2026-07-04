import { invoke } from "@tauri-apps/api/core";
import { secureStorage } from "@/lib/secure-storage";

const CLIENT_ID_KEY = "GMAIL_CLIENT_ID";
const CLIENT_SECRET_KEY = "GMAIL_CLIENT_SECRET";
const TOKENS_KEY = "GMAIL_OAUTH_TOKENS";

export interface GmailTokens {
  access_token: string;
  refresh_token?: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export interface OAuthStartResult {
  auth_url: string;
  code_verifier: string;
  port: number;
}

export async function getStoredClientId(): Promise<string | null> {
  return secureStorage.get(CLIENT_ID_KEY);
}

export async function getStoredClientSecret(): Promise<string | null> {
  return secureStorage.get(CLIENT_SECRET_KEY);
}

export async function saveClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<void> {
  await secureStorage.set(CLIENT_ID_KEY, clientId);
  await secureStorage.set(CLIENT_SECRET_KEY, clientSecret);
}

export async function getStoredTokens(): Promise<GmailTokens | null> {
  const raw = await secureStorage.get(TOKENS_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function isGmailConnected(): Promise<boolean> {
  const tokens = await getStoredTokens();
  return !!tokens?.access_token;
}

export async function startOAuthFlow(): Promise<OAuthStartResult> {
  const clientId = await getStoredClientId();
  const clientSecret = await getStoredClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Gmail client ID and secret must be configured in Settings first.");
  }

  const result: OAuthStartResult = await invoke("start_gmail_oauth", {
    clientId,
    clientSecret,
  });

  return result;
}

export async function completeOAuthFlow(
  codeVerifier: string,
): Promise<GmailTokens> {
  const clientId = await getStoredClientId();
  const clientSecret = await getStoredClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Gmail client ID and secret must be configured.");
  }

  const tokens: GmailTokens = await invoke("complete_gmail_oauth", {
    clientId,
    clientSecret,
    codeVerifier,
  });

  await secureStorage.set(TOKENS_KEY, JSON.stringify(tokens));
  return tokens;
}

export async function cancelOAuthFlow(): Promise<void> {
  await invoke("cancel_gmail_oauth");
}

export async function disconnectGmail(): Promise<void> {
  await secureStorage.set(TOKENS_KEY, "");
}

export async function refreshGmailTokens(
  refreshToken: string,
): Promise<GmailTokens> {
  const clientId = await getStoredClientId();
  const clientSecret = await getStoredClientSecret();

  if (!clientId || !clientSecret) {
    throw new Error("Gmail client credentials not configured.");
  }

  const tokens: GmailTokens = await invoke("refresh_gmail_token", {
    clientId,
    clientSecret,
    refreshToken,
  });

  const existing = await getStoredTokens();
  const merged: GmailTokens = {
    ...existing,
    ...tokens,
    refresh_token: tokens.refresh_token || existing?.refresh_token || refreshToken,
  };

  await secureStorage.set(TOKENS_KEY, JSON.stringify(merged));
  return merged;
}
