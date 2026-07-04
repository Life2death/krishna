# Job-hunter API access plan — machine token for Krishna

> Spec for the coding agent. Companion to `JOB_AUTOPILOT_PLAN.md` (J2/J4 depend on this).
> **This work happens in a DIFFERENT repo:** `D:\Learning\job-hunter` (GitHub
> `Life2death/job-hunter`, deployed on Render at `https://job-hunter-x5l1.onrender.com`,
> Flask + Supabase). Branch there: `feat/krishna-api-token`. Commit prefix: `feat(kapi-hN)`.
> Findings file (in the KRISHNA repo, with the rest): `JOB_AUTOPILOT_REVIEW_FINDINGS.md`.

## What already exists (verified in `web_app.py` 2026-07-04 — do NOT build new endpoints)

The JSON API Krishna needs is already there:
- `GET /api/jobs` — filters: `track`, `portal`, `status`, `min_fit`, `applied_date`,
  `imported_date`, plus `limit`/`offset` with deterministic fit-desc + job_id ordering.
  **`?status=not_applied` IS the queue.** Returns rows with absolutized URLs.
- `GET /api/jobs/count`, `/api/jobs/stats`, `/api/jobs/breakdown` — for spoken summaries.
- `POST /api/jobs/<job_id>/status` — mark applied (Supabase trigger already guards against
  status regressions).
- `POST /apply/<job_id>`, `POST /api/jobs/hide`.

**The ONLY gap:** `@app.before_request check_auth()` accepts a Flask session cookie only
(email/password login). Krishna is a headless machine client — it needs a token path.

## H1 — bearer-token auth path (the entire scope of this plan)

In `web_app.py`:

1. Read `KRISHNA_API_TOKEN` and `KRISHNA_API_USER_EMAIL` from env (both must be set for the
   feature to exist; if either is missing, behavior is exactly as today — no token path).
2. In `check_auth()` (or a helper it calls), BEFORE the session check: if the request carries
   `Authorization: Bearer <token>` and it matches `KRISHNA_API_TOKEN` via
   **`hmac.compare_digest`** (constant-time — not `==`), treat the request as authenticated
   for the user `KRISHNA_API_USER_EMAIL.lower()` WITHOUT creating a session. The cleanest
   mechanism: set `g.api_user_email`, and make `uid()` prefer `g.api_user_email` over the
   session value.
3. Token requests are **API-only**: if a bearer-authenticated request targets a non-`/api/`,
   non-`/apply/` endpoint (page routes, settings, admin), reject 403 — the token is for the
   job data plane, not the web UI or admin surface.
4. A wrong/malformed bearer token → 401 JSON (`{"error":"invalid token"}`), NOT a redirect
   to the login page (Krishna needs a distinguishable machine-readable failure — same
   error-visibility discipline as Krishna pending item 1).
5. Never log the token value.

Tests (repo already uses pytest — `conftest.py`, `test_*.py`; follow its patterns):
- valid token → `/api/jobs` 200 with the owner's rows; `uid()` resolves to the env email
- valid token → page route (e.g. `/dashboard`) → 403
- invalid token → 401 JSON, no redirect
- no token, no session → existing redirect behavior unchanged
- env vars unset → bearer header ignored entirely, existing behavior unchanged
- timing-safe compare is used (assert on implementation, e.g. mock `hmac.compare_digest`)

## Owner (Vikram) actions after H1 is reviewed
1. Generate a long random token (the agent's phase report should include a one-liner to
   generate one, e.g. `python -c "import secrets; print(secrets.token_urlsafe(48))"`).
2. Set `KRISHNA_API_TOKEN` and `KRISHNA_API_USER_EMAIL=vikram.panmand@gmail.com` in the
   Render dashboard env vars.
3. Deploy job-hunter (push to GitHub → Render auto-deploy; job-hunter is NOT under Krishna's
   no-push release policy, but the push is still the owner's call).
4. Paste the same token into Krishna's Settings when J2's UI lands (stored via
   `secureStorage`, key `JOB_HUNTER_API_TOKEN` — Krishna gotcha #1 applies).

## Krishna-side contract (for J2 — recorded here so both repos agree)
- Queue read: `GET {base}/api/jobs?status=not_applied&limit=25` + `GET /api/jobs/count`.
- Mark applied: `POST {base}/api/jobs/<job_id>/status` (J4, after a verified submit only).
- All calls: `Authorization: Bearer <token>` via `getHttpFetch()` (Tauri transport — the
  T1-F4 lesson; never plain `fetch`).

## Explicitly rejected
- New/duplicate queue endpoints (`/api/queue` etc.) — `/api/jobs` filters already cover it.
- OAuth/JWT machinery for a single-owner personal tool — one static env token is right-sized.
- Scraping the web UI (was already rejected in `JOB_AUTOPILOT_PLAN.md`).
- Letting the bearer token reach admin/settings routes.
