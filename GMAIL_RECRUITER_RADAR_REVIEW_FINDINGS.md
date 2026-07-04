# Recruiter Radar — review findings

Track: item 13. Plan: `GMAIL_RECRUITER_RADAR_PLAN.md`. Branch: `fix/gmail-recruiter-radar`
(off `main`, contains R1 `c393ee2`). Commit prefix `feat(recradar-rN)`.

---

## Branch relocation (2026-07-04, reviewer)

R1 was originally committed as `8ed1684` **on the wrong branch** (`fix/gmail-latest-email`,
the item-12 gmail-fix branch) and pushed to origin (no-push-rule violation; `origin/main` was
not advanced, so no release fired). Reviewer relocated it: created `fix/gmail-recruiter-radar`
off the post-item-12 `main` (`7c8f4dc`) and cherry-picked R1 as **`c393ee2`** — clean, zero
conflicts, linear history (branch = `main` + R1 only).

**Coding agent must, in `D:\Learning\krishna-m15`, before starting R2:**
1. Ensure the worktree is clean (commit/stash anything local).
2. `git checkout fix/gmail-recruiter-radar` (it is not checked out elsewhere, so this works).
3. Continue R2 here. Do **not** keep building on `fix/gmail-latest-email` — it is now
   redundant (gmail fixes are in `main`, R1 is relocated). Delete it once switched:
   `git branch -D fix/gmail-latest-email` and, if you must, ask the owner before touching the
   pushed origin copy — do not push.

---

## R1 review (`c393ee2`) — APPROVED. Well-structured; no blockers. NITs only.

`packages/core/tools/recruiter-radar.ts` (+193) + `src/__tests__/recruiter-radar.test.ts`
(+218, 21 tests) + vite alias + a 3-line `gmail.test.ts` tweak (`{ vars: {} }` 2nd arg —
harmless). DI design is exactly right: `checkRecruiters(candidates, classify)` is pure and
fully unit-testable; heuristic fallback fires on both classify-throw and invalid-output; tests
cover digest-vs-outreach, LinkedIn/Naukri, both fallback paths, cap messaging, brief formatting,
and all `formatSince` buckets. tsc clean (`noUnusedLocals:false`), vitest green (agent: 476
across 27 files; identical file tree post-relocation, so unchanged).

**NITs (fix opportunistically in R2, none blocking):**

- **N1 · dead import.** Line 1 `import type { ToolContext } from "./index";` is unused. Only
  not failing tsc because `noUnusedLocals` is off. Remove it.
- **N2 · `isValidClassifications` accepts a non-bijection.** It checks `length === candidates.length`
  and that each returned id exists among candidates, but not that ids are **unique / cover every
  candidate**. A classify result that repeats one id and omits another passes validation → one
  candidate silently dropped, another double-counted. Low risk (R3 owns the classify fn), but
  tighten to a bijection when R3 wires the real classifier: verify the set of returned ids
  equals the set of candidate ids.
- **N3 · `capHit` is inferred, can false-positive.** Line 111 `capHit: candidates.length >= MAX_CANDIDATES`
  treats "exactly 25 candidates" as "we hit the cap" even when 25 was simply all there were.
  The **fetch layer** knows whether it truncated. In R2, have the fetch pass an explicit
  `capHit` into `checkRecruiters` (or return it from fetch) rather than inferring from count.
- **N4 · spoken raw email in the fallback brief.** `buildBrief` fallback (line 161) speaks the
  raw `from` (`"Name <addr@x>"`) + subject when no structured fields. TTS will read the email
  address aloud — same "raw data reaching the spoken layer" class as item 14. Consider speaking
  a display-name-only or a trimmed sender. Minor (degraded path).
- **N5 · "this morning" is time-of-day-blind.** `formatSince` maps any 6–23h delta to
  "this morning" regardless of clock time (10h ago at 2am isn't "this morning"). Cosmetic;
  leave unless it grates live.

---

## R2 — where to work (scope from plan §"State", lines 72–84)

**File(s):** new DB migration + a small state-access module; extend `checkRecruiters`'s
**caller** (not the pure core) to apply the seen-filter. Keep `checkRecruiters` pure — the
seen/last-check logic belongs in the layer that fetches candidates and calls it.

**Pre-flight (plan lines 119–126, do first, report findings):**
1. **Inspect the existing DB/kv layer.** The agent's R1 pre-flight already found **no kv table
   exists** → plan says create `recruiter_radar_state` following the `sync_state` pattern.
   Confirm `sync_state` is the right template and say so in the report.
2. **Migration must be LF-normalized** (T4-F5 checksum gotcha — CRLF in a migration file breaks
   the checksum). This is the single most likely footgun here.

**Build:**
- `recruiter_seen(message_id TEXT PRIMARY KEY, first_seen_at INTEGER)` — record **every**
  fetched candidate id (all classes, not just outreach) so old mail isn't re-classified next ask.
- last-check timestamp — single-row table or the new state table (agent's choice; **state it in
  the report**).
- **Bare ask:** report only `recruiter_outreach` whose id ∉ `recruiter_seen`; then mark all
  fetched candidates seen + update last-check. Cold start (no state) = 7 days (`COLD_START_DAYS`,
  already defined in R1).
- **Explicit window** ("recruiter mail this week?" → `window_days`, cap 14 = `MAX_WINDOW_DAYS`,
  already defined): stateless for **reporting** (give the whole window), but still upsert seen
  state afterward.

**Tests (plan R2 row):** the load-bearing one is **"second ask same day returns nothing new"**
(bare ask twice → first returns outreach, second returns none because ids are now seen). Also:
cold-start uses 7-day window; explicit-window ignores seen-filter for reporting but still upserts.

**Do NOT in R2:** action/prompt wiring, `executeAction` branch, logOutcome/errorDetail — that
is **R3**. R2 is state + windowing semantics only. One phase per commit; stop and report after R2.

**Also unresolved from the plan pre-flight (flag if not yet done):** verify `category:primary`
returns results on the connected account, else fall back to `in:inbox` (plan lines 121–123).
This needs Gmail actually connected — which depends on the owner completing the G-13 live Connect.
