# Job autopilot review findings

> Reviewer (Claude) findings for pending item 10 (job autopilot) and its H1 sub-task
> (job-hunter bearer token, `JOB_HUNTER_API_PLAN.md`). H1 work lives in the SEPARATE repo
> `D:\Learning\job-hunter`; this findings file lives in the Krishna repo on `main` with the
> rest. Agent: fix OPEN items, mark `FIXED (commit <sha>)`.

## H1 — `feat/krishna-api-token` commit `072a2ff` (job-hunter repo)

Reviewed the real diff + traced every `/api/` and `/apply/` handler's identity resolution.
**Core auth logic is correct:** `hmac.compare_digest` (constant-time), bearer check runs
*before* the session fallback, `uid()` prefers `g.api_user_email`, page routes → 403, wrong
token → 401 JSON (not a login redirect), env-unset → bearer ignored and existing session
behavior preserved, no token value logged, `g` is per-request so no bleed. 11 focused tests,
51/51 green. Good work — the token's effective reach today is exactly the job data plane
(verified below). Two findings, both about robustness rather than a live hole.

### Effective reach (verified — this is what the token can actually touch today)
- `uid()`-based (bearer-aware, token WORKS): `/api/jobs`, `/api/jobs/count|stats|breakdown`
  (read), `POST /api/jobs/<id>/status`, `POST /api/jobs/hide`, `POST /apply/<id>` (write
  applied). ✅ exactly the J2/J4 surface.
- `session.get()`-based (bearer-blind, token REJECTED with 401): `/api/settings` GET+POST,
  `/settings`, `/queue`. Admin routes (`/admin`, `/admin/approve/<email>`) are both non-`/api/`
  (→ 403 at the gate) AND `session.get("is_admin")`-guarded. ✅ settings + admin are out of reach.

So **no cross-user or privilege-escalation hole exists today.** The findings are about *why*
settings is safe.

### H1-1 · NIT (robustness — not exploitable today, fix before/at deploy) · `/api/` prefix allowlist is broader than spec; `/api/settings` is only *incidentally* protected
**FIXED (commit `96ac399`).** Replaced bare `/api/` prefix with explicit
`TOKEN_ALLOWED_PREFIXES = ("/api/jobs", "/apply/")` tuple. `/api/settings` is now
rejected at the gate (403) rather than incidentally by the endpoint session check.
Added regression tests: `GET /api/settings` and `POST /api/settings` with valid
token both assert 403.

### H1-2 · NIT · Non-ASCII bearer token raises `TypeError` → 500 instead of a clean 401
**FIXED (commit `96ac399`).** Changed to byte comparison (`token.encode()` /
`KRISHNA_API_TOKEN.encode()`). Added regression test: non-ASCII `\u00e9\u00e0\u00fc`
token returns 401, not 500.

### H1-3 · NIT (documentation) · make the uid()/session split intentional
**FIXED (commit `96ac399`).** Added doc comment above the bearer block documenting
the invariant: job-data endpoints use `uid()` (bearer-aware), settings/admin/page
routes read `session` directly (bearer-blind). The `TOKEN_ALLOWED_PREFIXES` tuple is
noted as the single security boundary.
The coherent-but-implicit rule keeping the token in its lane is: **job-data endpoints resolve
identity via `uid()` (bearer-aware); anything that must stay owner-web-only reads `session`
directly (bearer-blind).** One comment at the bearer block stating this would turn today's
accidental correctness into a documented invariant future endpoints can follow.

**Retest (reviewer, `96ac399`): all 3 findings VERIFIED FIXED.** Re-read the diff and ran
`pytest test_bearer_auth.py` → 14/14 green (54/54 whole suite per agent). H1-1: allowlist is now
`("/api/jobs", "/apply/")` — traced every route, this covers exactly the 6 job endpoints + apply
and excludes `/api/settings` (now 403 at the gate, with GET+POST regression tests). H1-2:
`.encode()` byte compare, non-ASCII `éàü` token → 401 test passes. H1-3: doc comment present.
**H1 approved — ready for the owner to deploy.**

**Verdict (original):** H1 is functionally correct and not exploitable as-is. Recommend landing H1-1
(explicit allowlist + regression test) and H1-2 (byte compare) before the owner deploys — both
are small and they convert a security boundary from robust-by-accident to robust-by-design. H1-3
optional. After that, the owner's deploy steps (generate token → set `KRISHNA_API_TOKEN` +
`KRISHNA_API_USER_EMAIL` in Render → push) are unchanged.

---

## J2 review — DONE + MERGED (`c2bbe5f`; tool 714f0e8, fixes 698355f). Was: 2 issues + 1 decision, all resolved.

Committed properly this time (m15 clean, 534 tests green, tsc clean). Good: `getSecret(TOKEN_KEY)`
for the token (secureStorage, matches Gmail/Maps), `getHttpFetch()` transport, clean error taxonomy
(no-token / 401 / non-ok / network / empty), G-2 `errorDetail` propagation, `kind:"answer"`,
JobHunterSettings password field. Response envelope `{rows, total}` VERIFIED correct against the
live API **for the `&limit=25` query** (bare-array only when no limit) — the agent guessed right.

**J2-A · BLOCKER (functional) · `job_queue` is classified "sensitive" → gated behind confirmation.**
The agent added the tool but did NOT add the action to `KNOWN_SAFE` (`packages/core/action-policy.ts`).
`classifyAction("job_queue")` misses KNOWN_SAFE, isn't `computer_`/`mcp_`, so falls through to
`return "sensitive"` (line 55). A read-only queue lookup will therefore trigger the confirm /
unverified-speaker gate every time — every other read tool (gmail_search, gmail_recruiters, …) is
in KNOWN_SAFE. **Fix:** add `"job_queue"` to `KNOWN_SAFE` (one line) + a classifyAction test.

**J2-B · MEDIUM (correctness/UX) · spoken count reports the page cap (25), not the real count.**
The summary says `You have ${rows.length} unapplied jobs` — but `rows` is capped at `limit=25`, so
whenever there are ≥25 it always says "25". Live API returns `total: 14408` (the real not-applied
count) alongside 25 rows. So the tool currently says "You have 25 unapplied jobs… (14408 total in
pipeline)" — self-contradictory. The tests missed this because the mock set `rows.length == total`.
**Fix:** lead with `total` as the count; use `rows` only for the top-3 preview. Add a test where
`total > rows.length` asserting the spoken count uses `total`.

**OWNER DECISION (blocks the J2-B framing):** `total = 14408` unapplied jobs is huge (the scraper
imports listings the user hasn't applied to). Speaking "you have 14,408 unapplied jobs" is
technically right but useless. Decide the framing: (a) speak total + top-3 by fit ("14,408 in your
pipeline; top 3 by fit: …"); (b) speak only a high-fit subset count ("N jobs above fit X"); or
(c) a fixed "top matches" view. **OWNER CHOSE (a) 2026-07-05:** speak the real total + top 3 by fit. e.g. "You have 14,408 jobs in your pipeline, sir. Top 3 by fit: A, B, C."

**Minor (non-blocking):** (1) no-token error says "add it in Settings under Integrations" but the
section is its own JobHunterSettings — fix wording. (2) "added today" uses `new Date().toISOString()`
(UTC) vs the owner's IST — off by part of a day near midnight; low priority.

**RESOLVED (698355f, merged c2bbe5f):** J2-A job_queue added to KNOWN_SAFE (+trust.test); J2-B count uses total with owner framing (total + top 3 by fit); wording fixed. tsc clean, 97/97 affected tests green. Minor left (non-blocking): "Top 3" label hardcoded even when top.length<3; "added today" uses UTC not IST. NEXT: RR-2.**

---

## J3-A · NIT (owner-reported, live 2026-07-05) · Resume Path requires manually typing an absolute file path

`ApplicationProfileSettings.tsx:140-146` — the "Resume Path" field is a plain `<input type="text">`
(`placeholder="C:\Users\vikra\Documents\resume.pdf"`). The owner has to hand-type or paste a full
Windows path with no way to browse the filesystem. User-hostile and error-prone (typos, wrong
drive, no validation that the file exists). Confirmed: the project has **no Tauri file-dialog
plugin at all** (`@tauri-apps/plugin-dialog` is not a dependency; the only "dialog" in the repo is
the unrelated Radix UI modal component) — this needs a real addition, not a one-line tweak.

**Fix (small, self-contained; do NOT block J4 on this):**
1. Add `@tauri-apps/plugin-dialog` (npm) + the matching Rust crate (`tauri-plugin-dialog`) +
   register it in `src-tauri/src/lib.rs` + grant the `dialog:default` (or scoped `dialog:allow-open`)
   capability in `capabilities/default.json`/`cross-platform.json` (same pattern as every other
   plugin addition — capabilities file, not just `Cargo.toml`).
2. In `ApplicationProfileSettings.tsx`, add a "Browse..." button next to the Resume Path input
   that calls the plugin's `open({ multiple: false, filters: [{ name: "PDF", extensions: ["pdf"] }] })`
   and writes the returned path into `profile.resumePath`. Keep the text input too (manual paste
   still works; some users may want to type a network path) — just add the picker as the easy path.
3. Nice-to-have: on load, if `resumePath` is set but the file doesn't exist (basic existence check
   via a Tauri fs command), show a small warning inline — catches a stale/renamed resume before
   J4 tries to upload it.
4. Tests: browse-button wiring (mock the dialog plugin), path still editable manually.

**Priority:** low/non-blocking — J4 just reads `profile.resumePath` as a string regardless of how
it got there, so this doesn't gate assisted apply. Schedule it as a quick UX fix once the J4
sub-phases land (or bundle with the next Settings-reorg pass, since it touches the same file).

---

## J4-a (`2e4310d` + fixes `a333484`) — FIXED + MERGED (`2ea06b5`).

JA-1 fixed: `evaluate()` now unwraps `resp.result.value` + throws on `exceptionDetails`; real-path test added (mocks the nested CDP shape — would've caught the original bug). JA-2 fixed: Easy-Apply preferred (leading match, clicked), external plain Apply reported `{clicked:false, reason}` without clicking, `{found,clicked,text?,tag?,reason?}` shape, regex excludes applied/apply-filter/reapply. 20 tests green, tsc clean. **Live verification is owner-side** (open a real LinkedIn job → confirm it clicks Easy Apply).

<details><summary>Original J4-a findings (pre-fix)</summary>

## J4-a (`2e4310d`) — NOT MERGED. 1 blocker + 1 quality gap + a test-coverage hole.

Plumbing is mostly sound: `CdpClient.connect` (WebSocket, id-keyed pending map, CDP-error handling),
`listTargets` (getHttpFetch → /json, page filter), `navigate` (Page.navigate). Allowlist + CSP for
`localhost:9222` added correctly. But the core path (click Apply) is broken against real Chrome.

### JA-1 · BLOCKER · `evaluate()` unwraps the CDP response one level too shallow → returns undefined live
`Runtime.evaluate`'s result object is `{ result: RemoteObject, exceptionDetails? }`, and with
`returnByValue:true` the value is at **`result.result.value`**. `send()` returns `msg.result` =
`{ result: {type,value}, exceptionDetails? }`, but `evaluate()` reads `result.type` / `result.value`
(one level too shallow) — both `undefined` against real Chrome. So `clickApplyButton` does
`JSON.parse(undefined)` → throws. **`job_apply` cannot click Apply on a real page.** The eval-error
check is also wrong: CDP signals script errors via `exceptionDetails`, not `result.subtype==="error"`.
**Fix:**
```ts
const resp = await this.send<{ result: { type: string; subtype?: string; value?: T; description?: string }, exceptionDetails?: { text: string; exception?: { description?: string } } }>(
  "Runtime.evaluate", { expression: expr, awaitPromise, returnByValue: true });
if (resp.exceptionDetails) throw new Error(`CDP evaluate error: ${resp.exceptionDetails.exception?.description ?? resp.exceptionDetails.text}`);
return resp.result.value as T;
```

### JA-1-TESTS · why JA-1 slipped · tests reimplement the heuristic instead of exercising the real path
`job-apply.test.ts`'s `evalClickApplyJS` is a **hand-copied** version of the button-matching logic run
against jsdom HTML — it never calls `clickApplyButton` → `evaluate`, so the CDP unwrapping is 100%
untested (same class as G-11 / J2-B / TI-1: the mock/reimpl doesn't match the real seam). **Fix:**
add a test that drives `clickApplyButton()` against a **mocked CDP WebSocket** whose `Runtime.evaluate`
reply has the REAL nested shape `{ result: { result: { type:"string", value: '{"found":true,...}' } } }`.
That test must fail against the current shallow `evaluate` and pass after the JA-1 fix.

### JA-2 · QUALITY (do with JA-1) · Apply heuristic clicks the first `/apply/i` match — no Easy-Apply preference
The reviewer-recommended guardrail was not implemented. `clickApplyButton` clicks the FIRST `button/a`
whose text/aria-label matches `/apply/i` and returns `{found,text,tag}`. On a real LinkedIn job page
that can hit a nav "apply filters" control, a footer link, "reapply", or a plain external **"Apply"**
(redirects off-site — J4 can't fill those) BEFORE the in-page **"Easy Apply"** button. Clicking the
wrong one is a dead end for the owner tomorrow. **Fix:** (1) prefer an exact/leading "Easy Apply"
match; (2) if only a plain external "Apply" exists, return `{found:true, clicked:false, reason:"external
ATS apply — out of MVP scope"}` and do NOT click it; (3) richer return shape `{found, clicked, text?,
tag?, reason?}` (separate found/clicked; reason on every negative — EV-1 discipline). Tighten the regex
so it doesn't match "applied"/"apply filters" (word-boundary / known-label list).

**Verdict: fix JA-1 (+ its real-path test) and JA-2 on `feat/job-autopilot`, re-review before merge.
Everything else in the commit (connect/navigate/listTargets/allowlist/CSP/action wiring) is fine.**

</details>

---

## J4-b (`3f4db06` + fix `2afa128`) — FIXED + MERGED (`b579f43`).

JB-1 fixed: profile now loaded via `getMemoryByKey("application_profile")` from the memory DB store (matching J3) + load-path tests (stored-profile fills; null → 'no profile yet'). Field-fill engine (enumerate/map/fill/summary) sound, FillProfile keys match J3. 35 tests green, tsc clean. **Live-verify owner-side:** open a real LinkedIn Easy Apply → confirm fields fill from the saved profile. Original finding below.

<details><summary>Original J4-b finding (pre-fix)</summary>

## J4-b (`3f4db06`) — NOT MERGED. 1 blocker (wrong profile store). Everything else sound.

`field-fill.ts` is well-built: `ENUMERATION_JS` (resolves labels via for/aria-label/wrapping-label/
placeholder, skips hidden/submit/button, builds unique selectors), `mapFields` (label-pattern regex
per profile key, collects unmapped required, detects file inputs), `makeFillJs` (native setter +
input/change events; select option-matching), `fillForm`, `filledSummary`. **`FillProfile` keys
exactly match J3's `ApplicationProfile`** — no shape drift. Real-path CDP `evaluate` test present
(JA-1 lesson applied). Good work overall.

### JB-1 · BLOCKER · profile loaded from `localStorage`, but J3 saved it to the memory DB store
`job-apply.ts:118` does `localStorage.getItem("application_profile")`. But J3's
`ApplicationProfileSettings` saves the profile via `createMemory({ key: "application_profile", ... })`
into the **`memories` DB table** (SQLCipher) and reads it back via `getMemoryByKey`. localStorage is
never written — so `getItem` returns `null`, J4-b always hits the else branch ("I don't have your
application profile yet, sir"), and **no fields are ever filled** even though the owner filled the
profile. **Fix:** load via the same store J3 wrote to —
```ts
import { getMemoryByKey } from "../database/memories.action";
...
const mem = await getMemoryByKey("application_profile");
if (mem?.value) {
  const profile = JSON.parse(mem.value) as FillProfile;
  const fillResult = await fillForm(cdp, profile);
  ...
} else { /* the existing "no profile yet" spoken line */ }
```
(`getMemoryByKey` uses the same `getDatabase` driver the tool layer already relies on.)

### JB-1-TESTS · the load-path seam is untested (why JB-1 slipped)
The J4-b tests pass a `FillProfile` fixture directly into `mapFields`/`fillForm` — none exercise
`job-apply.ts` loading the profile from the store. Add a test for the execute path that mocks
`getMemoryByKey` returning a stored profile and asserts `fillForm` is invoked with it (and the
"no profile" branch when it returns null). Same recurring lesson: test the real integration seam,
not just the pure helper.

**Verdict: fix JB-1 (+ load-path test) on `feat/job-autopilot`, re-review before merge. Rest of
J4-b is approved.**

</details>

---

## J4-c (`52e141a`) — MERGED (`ed1fd08`). Confirm-gated submit. 1 follow-up (JC-1).

`job_apply_submit` tool: sensitive (NOT in KNOWN_SAFE), verbatim-confirm gate (G-5 pattern,
`preConfirmed` skip like gmail_send), decline returns clean message. `clickSubmitButton` (excludes
cancel/back/previous; type=submit + submit/send/next/continue/done; input value vs textContent) and
`verifySubmission` (body confirmation-text regex) both use the FIXED CDP `evaluate` (JA-1). Honest
ambiguous path ("clicked Submit but not certain it went through"). Clean CDP-unreachable handling.
59 job-apply tests green, tsc clean. Reviewer-verified + merged per owner request.

### JC-1 · MEDIUM follow-up · applied-status POST is unconditional (tension with gotcha #3)
In `job-apply-submit.ts`, the `POST /api/jobs/{jobId}/status {status:"applied"}` runs right after a
successful submit click, **before and regardless of `verification.success`**. So on an ambiguous
result the spoken line says "I'm not certain it went through" while the backend has already been told
"applied" → the job leaves the not_applied queue even if the submit actually failed (a genuinely
un-submitted job is lost). Mitigated today: submit is confirm-gated + owner-supervised. **Recommended
fix:** POST "applied" only when `verification.success`; on ambiguous, either skip the POST (leave in
queue to retry) or POST a distinct status (e.g. "submitted_unverified") if job-hunter supports it.
Also worth clarifying the plan wording (§J4 step 6 reads ambiguously on whether to POST when
ambiguous). Non-blocking; owner watches each submit.

### ⚠️ J3-A · NOT COMMITTED — nothing to merge yet
J3-A (resume file picker) was NEVER committed. Its changes sit UNCOMMITTED in the `krishna-m15`
worktree: `package.json` (+@tauri-apps/plugin-dialog), `Cargo.toml` (+tauri-plugin-dialog),
`capabilities/cross-platform.json` (dialog permission), plus presumably `ApplicationProfileSettings.tsx`
+ `src-tauri/src/lib.rs` (plugin register) + tests. **These are the changes whose `npm install`
corrupted node_modules.** Because `main` was clean-installed from `main`'s lockfile (WITHOUT
plugin-dialog), J3-A cannot be merged until: (1) the agent COMMITS it including the updated
`package.json` AND `package-lock.json` (or the picker breaks on the next `npm ci`), and (2) reviewer
re-installs + reviews. **Do NOT merge J3-A until committed with the lockfile.**
