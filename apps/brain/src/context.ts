import type { FieldCrypto } from "./crypto/field-crypto.ts";
import type { Hub } from "./ws.ts";
import type { Client } from "@libsql/client";

/** Shared services handed to every route group. */
export interface BrainContext {
  crypto: FieldCrypto;
  hub: Hub;
  db: Client;
}
