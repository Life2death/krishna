# Spec: Speak a friendly name / domain instead of raw URLs in TTS

**Bug:** Krishna's spoken reply goes fast and unintelligible in the last 2–3
lines whenever the reply contains a raw URL (e.g. an "I can open a search for
you: https://…" offer). TTS engines rattle through long non-word tokens (URLs,
query strings, hostnames) instead of articulating them.

**Goal:** In the **spoken** text only, replace each URL with a short human name:

1. **Friendly name** if we know one (a remembered/named link or a url-type app
   alias) → e.g. `https://job-hunter-x5l1.onrender.com/` → **"job dashboard"**.
2. **Domain SLD** otherwise → e.g. `https://www.google.com/search?q=news` →
   **"google"**.
3. **"a link"** as last resort (unparseable / single-label host).

**Out of scope:** the visible/displayed text and any ```` ```action ```` block
keep the full URL untouched (still clickable + actionable). Do NOT touch TTS
rate — there is no rate drift (`utterance.rate` is set once per utterance and
never mutated; Piper/ElevenLabs don't expose rate). The fast-tail symptom is
100% the raw-URL token, nothing else.

---

## Root cause (grounded)

All three providers — `BrowserTTS`, `ElevenLabsTTS`, `PiperTTS` — call the same
helper `stripMarkdown()` in `src/lib/tts.ts` before speaking. It strips action
blocks / code fences / bold / headings and converts markdown links
`[text](url)` → `text`, but does **nothing to bare URLs in prose**.

`parseActions()` (`src/lib/actions.ts`) only removes the fenced
```` ```action ````/```` ```json ````/```` ```plan ```` blocks, so inline URLs in
the prose survive into `spokenText` (`krishna.context.tsx:1486`).

Status strings like `"Opening " + rawTarget` (`actions.ts:85`) also route through
`stripMarkdown`, so they benefit from the same fix.

---

## Friendly-name source (grounded)

Two sources, both already in the app:

1. **Remembered links** — `getRepo().memories` rows of shape
   `{ key, value, confirmed }` (`packages/core/memory.ts`, `useMemories.ts`).
   A row like `{ key: "job dashboard", value: "https://job-hunter-x5l1.onrender.com/", confirmed: true }`
   means URL → "job dashboard". Memories are **already loaded** in the relevant
   flow at `krishna.context.tsx:1459` (`const memories = await getAllMemories();`),
   in the same scope as `parseActions` (line 1486) and the speak call (1498).

2. **URL-type app aliases** — `APP_ALIASES` in `src/config/app-aliases.ts`
   entries where `type === "url"` have `{ name, url }`. (None today are url-type,
   but the lookup should support them for the future.)

Only `confirmed` memories whose `value` is a URL (`isUrl(value)` from
`app-aliases.ts`) and whose `key` is non-null should produce a friendly name.

---

## Architecture

`stripMarkdown` is pure/sync with no data access, and `ttsRef.current.speak(...)`
is called from ~15 sites in `krishna.context.tsx`. To keep the **single
chokepoint** (one fix covers all providers + all call sites), use a module-level
name map that the context refreshes each turn:

### New file: `src/lib/speech-sanitize.ts`

```ts
import { isUrl } from "@/config/app-aliases";

// noise words trimmed off a memory key so "jobs url" -> "jobs"
const KEY_NOISE = /\s*\b(url|link|page|site|website)\b\s*$/i;

const TWO_PART_TLDS = new Set([
  "co.uk", "co.in", "co.jp", "co.nz", "co.za", "com.au", "com.br",
  "org.uk", "gov.uk", "ac.uk", "com.cn",
]);

type NameEntry = { host: string; path: string; name: string };
let nameEntries: NameEntry[] = [];

function parse(raw: string): { host: string; path: string } | null {
  try {
    const withScheme = /^[a-z]+:\/\//i.test(raw) ? raw : `https://${raw}`;
    const u = new URL(withScheme);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const path = (u.pathname + u.search).replace(/\/+$/, "").toLowerCase();
    return host ? { host, path } : null;
  } catch {
    return null;
  }
}

/** Refresh the URL -> friendly-name map. Call once per turn from the context. */
export function setSpokenUrlNames(
  memories: { key: string | null; value: string; confirmed: boolean }[],
  urlAliases: { name: string; url?: string }[] = [],
): void {
  const entries: NameEntry[] = [];
  for (const m of memories) {
    if (!m.confirmed || !m.key || !m.value || !isUrl(m.value)) continue;
    const p = parse(m.value);
    if (!p) continue;
    entries.push({ ...p, name: m.key.replace(KEY_NOISE, "").trim() || m.key });
  }
  for (const a of urlAliases) {
    if (!a.url) continue;
    const p = parse(a.url);
    if (p) entries.push({ ...p, name: a.name });
  }
  nameEntries = entries;
}

/** "https://www.google.com/search?q=x" -> "google"; named link -> its name. */
export function urlToSpokenName(raw: string): string {
  const p = parse(raw);
  if (!p) return "a link";

  // 1. friendly name — prefer a full host+path match, then host-only
  const full = nameEntries.find(e => e.host === p.host && e.path && e.path === p.path);
  if (full) return full.name;
  const hostOnly = nameEntries.find(e => e.host === p.host);
  if (hostOnly) return hostOnly.name;

  // 2. domain SLD
  const labels = p.host.split(".");
  if (labels.length < 2) return "a link";
  const lastTwo = labels.slice(-2).join(".");
  const idx = TWO_PART_TLDS.has(lastTwo) ? labels.length - 3 : labels.length - 2;
  return labels[idx] || "a link";
}

/** Strip markdown + speak domain/friendly-name for any URL. */
export function sanitizeSpeech(text: string): string {
  return text
    .replace(/```action\n[\s\S]*?\n```/g, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")  // markdown link -> text (MUST stay before URL strip)
    .replace(/#{1,6}\s/g, "")
    .replace(/>\s/g, "")
    // --- spoken-only URL handling ---
    .replace(/https?:\/\/\S+/gi, (m) => urlToSpokenName(m))
    .replace(/\bwww\.\S+/gi, (m) => urlToSpokenName(m))
    // bare multi-label hostnames w/ optional path, e.g. job-hunter-x5l1.onrender.com/list
    .replace(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)+\.[a-z]{2,}(?:\/\S*)?/gi, (m) => urlToSpokenName(m))
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}
```

### `src/lib/tts.ts`
- Delete the local `stripMarkdown`; `import { sanitizeSpeech } from "./speech-sanitize"`.
- In all three providers replace `const cleaned = stripMarkdown(text);` with
  `const cleaned = sanitizeSpeech(text);` (lines ~36, ~88, ~202).

### `src/contexts/krishna.context.tsx`
- `import { setSpokenUrlNames } from "@/lib/speech-sanitize";`
- `import { APP_ALIASES } from "@/config/app-aliases";`
- Right after `const memories = await getAllMemories();` (line 1459), add:
  ```ts
  setSpokenUrlNames(
    memories,
    APP_ALIASES.filter(a => a.type === "url"),
  );
  ```
  This refreshes the map before any `speak()` in the turn, so every call site
  (all ~15) is covered with no per-site change.

---

## Case-by-case behavior (the acceptance table)

| # | Reply contains | Memory state | Spoken output |
|---|---|---|---|
| 1 | `...open it: https://job-hunter-x5l1.onrender.com/` | `{key:"job dashboard", value:".../", confirmed:true}` | `...open it: job dashboard` |
| 2 | `...page is job-hunter-x5l1.onrender.com/list` (bare host, path differs) | same as #1 | `...page is job dashboard` (host-only match) |
| 3 | `...search for you: https://www.google.com/search?q=latest+news` | not remembered | `...search for you: google` |
| 4 | `...check youtube.com/watch?v=abc` | not remembered | `...check youtube` |
| 5 | `...your store at shop.example.co.in/cart` | not remembered | `...your store at example` (2-part TLD handled) |
| 6 | `See [the docs](https://x.com/y)` | n/a | `See the docs` (markdown text kept; URL never spoken) |
| 7 | `Opening https://job-hunter-x5l1.onrender.com/` (status string) | as #1 | `Opening job dashboard` |
| 8 | `I prefer Node.js for that` | n/a | unchanged — no false strip (needs ≥2 dots for bare-host rule) |
| 9 | `localhost:3000` / single-label host | n/a | `a link` |

---

## Matching rules (precise)

- **Normalize** both stored value and candidate: lowercase, strip scheme, strip
  leading `www.`, strip trailing slash(es). `host` = hostname; `path` =
  `pathname + search` (no trailing slash).
- **Priority:** (1) host **and** non-empty path equal → name; (2) host equal →
  name; (3) SLD; (4) `"a link"`.
- **Key cleaning:** trim a trailing noise word (`url|link|page|site|website`)
  off the memory key so `"jobs url"` → `"jobs"`; `"job dashboard"` is unchanged.
- **Skip** memories that are unconfirmed, key-less, or whose value isn't a URL
  (`isUrl`), so facts like `"my password is hunter2"` never enter the map.
- **Ambiguity:** if two memories share a host, first match wins (memories are
  ordered by `getAllMemories()` — keep that order; don't sort).
- **2-part TLDs:** the small `TWO_PART_TLDS` set is a pragmatic list, not a full
  public-suffix list. Add entries if a real case sounds wrong; don't pull in a
  PSL library for this.

---

## Tests (`src/__tests__/speech-sanitize.test.ts`)

Cover the acceptance table. Drive the friendly-name cases by calling
`setSpokenUrlNames([...], [...])` first, then asserting `sanitizeSpeech(input)`:

1. Named link (full + host-only path variants) → friendly name (cases 1, 2).
2. Unknown google search URL → `"google"`, and output contains no `http` /
   no `?` / no `q=` (case 3).
3. Bare `youtube.com/watch?...` → `"youtube"` (case 4).
4. 2-part TLD `example.co.in/...` → `"example"` (case 5).
5. Markdown link → link text only, URL absent (case 6).
6. Negative: `"I prefer Node.js for that"` unchanged (case 8).
7. Single-label host → `"a link"` (case 9).
8. `setSpokenUrlNames` ignores unconfirmed / key-less / non-URL memories.

Note: existing `parseActions` tests are unaffected.

---

## Manual repro / verification

1. Remember a link: tell Krishna `remember my job dashboard is https://job-hunter-x5l1.onrender.com/`
   and confirm it.
2. `npm run tauri dev`, voice output ON.
3. Ask something that triggers an "I can open … : <that URL>" reply → it should
   speak **"job dashboard"**, not the raw URL, at normal speed.
4. Ask a current-events question that triggers a google-search offer → should
   speak **"google"**.
5. Confirm the on-screen reply still shows the full URL and the open/search
   action still works.

---

## Files
- `src/lib/speech-sanitize.ts` — **new**: `setSpokenUrlNames`, `urlToSpokenName`,
  `sanitizeSpeech`.
- `src/lib/tts.ts` — drop local `stripMarkdown`, use `sanitizeSpeech` in all 3
  providers.
- `src/contexts/krishna.context.tsx` — call `setSpokenUrlNames(...)` after
  `getAllMemories()` (~line 1459).
- `src/config/app-aliases.ts` — context only (`isUrl`, url-type aliases).
- `packages/core/memory.ts` — context only (Memory shape).
- `src/__tests__/speech-sanitize.test.ts` — **new** tests.
