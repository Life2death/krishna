import { secureStorage } from "./secure-storage";

const PREFIX = "enc:v1:";

async function getAesKey(): Promise<CryptoKey> {
  const hex = await secureStorage.get("KRISHNA_MASTER_KEY");
  if (!hex) throw new Error("KRISHNA_MASTER_KEY not found in secure storage");
  const raw = new Uint8Array(32);
  for (let i = 0; i < 64; i += 2) {
    raw[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

export async function encryptVoiceprint(plain: string): Promise<string> {
  if (plain.startsWith(PREFIX)) return plain;
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(plain);
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoded);
  const combined = new Uint8Array(12 + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), 12);
  return PREFIX + btoa(String.fromCharCode(...combined));
}

export async function decryptVoiceprint(stored: string): Promise<string | null> {
  if (!stored.startsWith(PREFIX)) return stored;
  try {
    const key = await getAesKey();
    const raw = Uint8Array.from(atob(stored.slice(PREFIX.length)), c => c.charCodeAt(0));
    const iv = raw.subarray(0, 12);
    const data = raw.subarray(12);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data);
    return new TextDecoder().decode(decrypted);
  } catch {
    return null;
  }
}
