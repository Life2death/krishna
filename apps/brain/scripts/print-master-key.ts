import { Entry } from "@napi-rs/keyring";

const SERVICE = "krishna-brain";
const ACCOUNT = "master-key";

async function main() {
  const entry = new Entry(SERVICE, ACCOUNT);
  let stored: string | null = null;
  try {
    stored = entry.getPassword();
  } catch {
    // not found
  }
  if (!stored) {
    console.error("No master key found in OS keyring.");
    process.exit(1);
  }
  // Decode from base64 to hex so it can be used as KRISHNA_MASTER_KEY
  const buf = Buffer.from(stored, "base64");
  if (buf.length !== 32) {
    console.error("Stored key is not 32 bytes — corrupt?");
    process.exit(1);
  }
  console.log(buf.toString("hex"));
}

main().catch((err) => {
  console.error("Failed to read master key:", err);
  process.exit(1);
});
