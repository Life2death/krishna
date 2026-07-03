import { getAllMemories } from "../database";

const ADDRESS_NOISE = /\s*\b(address|location|place)\b\s*$/i;

function normalizeKey(key: string): string {
  return key.trim().toLowerCase();
}

function stripAddressNoise(key: string): string {
  return key.replace(ADDRESS_NOISE, "").trim();
}

export async function resolvePlace(name: string): Promise<string> {
  if (!name) return name;

  const normalized = normalizeKey(name);

  const allMemories = await getAllMemories();
  const confirmed = allMemories.filter((m) => m.confirmed && m.key && m.value);

  // Exact match on memory key (e.g. "home address" == "home address")
  for (const m of confirmed) {
    if (normalizeKey(m.key!) === normalized) {
      return m.value;
    }
  }

  // Noise-stripped match (e.g. "home" matches "home address", "work location")
  const strippedInput = stripAddressNoise(normalized);
  for (const m of confirmed) {
    const strippedKey = stripAddressNoise(normalizeKey(m.key!));
    if (strippedKey === strippedInput) {
      return m.value;
    }
  }

  // Pass through — Google Routes API accepts raw text addresses
  return name;
}
