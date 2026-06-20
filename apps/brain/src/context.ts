import type { FieldCrypto } from "./crypto/field-crypto.ts";
import type { Hub } from "./ws.ts";

/** Shared services handed to every route group. */
export interface BrainContext {
  crypto: FieldCrypto;
  hub: Hub;
}
