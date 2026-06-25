import { readFile, writeFile } from "node:fs/promises";
import type { FieldCrypto } from "../crypto/field-crypto";

export interface GmailTokens {
  access_token?: string;
  refresh_token: string;
  scope?: string;
  token_type?: string;
  expiry_date?: number;
}

export async function loadToken(
  tokenPath: string,
  crypto: FieldCrypto,
): Promise<GmailTokens | null> {
  try {
    const raw = await readFile(tokenPath, "utf8");
    const decrypted = crypto.decrypt(raw);
    if (!decrypted) return null;
    return JSON.parse(decrypted) as GmailTokens;
  } catch (err) {
    const isFileNotFound = (err as any)?.code === "ENOENT";
    if (!isFileNotFound) {
      console.warn("[gmail] Failed to load token file — decryption error or corrupt data:", (err as Error)?.message ?? err);
    }
    return null;
  }
}

export async function saveToken(
  tokens: GmailTokens,
  tokenPath: string,
  crypto: FieldCrypto,
): Promise<void> {
  const encrypted = crypto.encrypt(JSON.stringify(tokens));
  if (!encrypted) throw new Error("Encryption returned null");
  await writeFile(tokenPath, encrypted, "utf8");
}
