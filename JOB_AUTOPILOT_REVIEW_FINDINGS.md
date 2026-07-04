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
`check_auth()` allows the token for anything under `/api/` (and `/apply/`). But
`JOB_HUNTER_API_PLAN.md` specified the token is for the "job data plane... not the web UI or
admin surface," and explicitly named **settings** as something to reject. `/api/settings`
(GET+**POST**, writes the owner's search config) sits under the `/api/` prefix, so the gate
lets the token through — it's blocked *only* because `api_settings()` happens to check
`session.get("email")` directly (line 1707) instead of `uid()`. The security boundary for
settings therefore lives in the endpoint, not the gate. Fragile in two ways: (a) any NEW
`/api/`-prefixed endpoint is auto-exposed to the token unless someone remembers to session-guard
it; (b) if `api_settings` is ever refactored to use `uid()` (natural, since the rest of the API
does), the token silently gains settings write with no test catching it. **Fix:** make the
allowlist explicit in `check_auth` — a set of the intended endpoints/paths (jobs read+count+
stats+breakdown, jobs/<id>/status, jobs/hide, apply) rather than a bare `/api/` prefix — so the
boundary is in ONE place and matches the spec. Add a regression test: `POST /api/settings` with
a valid token must be rejected (asserts the boundary, not the incidental session check).

### H1-2 · NIT · Non-ASCII bearer token raises `TypeError` → 500 instead of a clean 401
`hmac.compare_digest(token, KRISHNA_API_TOKEN)` requires both args be ASCII-only `str` (or both
bytes). `token` comes straight from the attacker-controllable `Authorization` header — a header
like `Bearer <non-ascii>` makes `compare_digest` raise `TypeError`, which surfaces as an
unhandled 500 rather than the intended 401. **Fix:** compare bytes —
`hmac.compare_digest(token.encode(), KRISHNA_API_TOKEN.encode())` — which never raises on input
charset and stays constant-time. Add a test with a non-ASCII token asserting 401.

### H1-3 · NIT (documentation) · make the uid()/session split intentional
The coherent-but-implicit rule keeping the token in its lane is: **job-data endpoints resolve
identity via `uid()` (bearer-aware); anything that must stay owner-web-only reads `session`
directly (bearer-blind).** One comment at the bearer block stating this would turn today's
accidental correctness into a documented invariant future endpoints can follow.

**Verdict:** H1 is functionally correct and not exploitable as-is. Recommend landing H1-1
(explicit allowlist + regression test) and H1-2 (byte compare) before the owner deploys — both
are small and they convert a security boundary from robust-by-accident to robust-by-design. H1-3
optional. After that, the owner's deploy steps (generate token → set `KRISHNA_API_TOKEN` +
`KRISHNA_API_USER_EMAIL` in Render → push) are unchanged.
