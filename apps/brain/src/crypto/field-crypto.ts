import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level field encryption (AES-256-GCM).
 *
 * Stored format:  "enc:v1:" + base64( iv(12) || authTag(16) || ciphertext )
 *
 * The "enc:v1:" marker lets us tell ciphertext from legacy plaintext, so the
 * brain stays backward-compatible with any rows written before encryption and
 * never double-encrypts. The cloud DB only ever sees ciphertext for these
 * fields — it is zero-knowledge for them.
 */
const PREFIX = "enc:v1:";

export interface FieldCrypto {
  encrypt(plain: string | null | undefined): string | null | undefined;
  decrypt(stored: string | null | undefined): string | null | undefined;
  isEncrypted(value: string): boolean;
}

export function makeFieldCrypto(key: Buffer): FieldCrypto {
  if (key.length !== 32) {
    throw new Error("Field encryption key must be 32 bytes (AES-256).");
  }

  return {
    isEncrypted(value: string): boolean {
      return typeof value === "string" && value.startsWith(PREFIX);
    },

    encrypt(plain) {
      if (plain == null) return plain;
      if (plain.startsWith(PREFIX)) return plain; // already encrypted
      const iv = randomBytes(12);
      const cipher = createCipheriv("aes-256-gcm", key, iv);
      const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
      const tag = cipher.getAuthTag();
      return PREFIX + Buffer.concat([iv, tag, ct]).toString("base64");
    },

    decrypt(stored) {
      if (stored == null) return stored;
      if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
      const raw = Buffer.from(stored.slice(PREFIX.length), "base64");
      const iv = raw.subarray(0, 12);
      const tag = raw.subarray(12, 28);
      const ct = raw.subarray(28);
      const decipher = createDecipheriv("aes-256-gcm", key, iv);
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
    },
  };
}
