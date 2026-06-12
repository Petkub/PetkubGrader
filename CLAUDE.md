# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

All workflow goes through the root `Makefile`:

```bash
make up             # docker compose up -d (all services)
make down           # stop, keep volumes
make build          # build images
make rebuild        # build --no-cache
make logs           # tail all services
make ps             # status

make migrate-init   # run ONCE after first up: alembic autogenerate tables from app/models.py
make migrate        # alembic upgrade head
make seed-topics    # insert default CP topic tags
make shell-api      # bash in fastapi container
make shell-db       # psql in app postgres
make backup         # pg_dump + tar testcases to ./backups/
```

After the schema lands, bootstrap the first admin manually:
```sql
-- inside `make shell-db`
UPDATE users SET role='admin', status='approved' WHERE email='you@example.com';
```

Per-app commands (rare — prefer the Makefile):
```bash
# FastAPI (run inside container or with uv locally)
docker compose run --rm fastapi pytest
docker compose run --rm fastapi ruff check app
docker compose run --rm fastapi alembic revision --autogenerate -m "msg"

# Next.js (inside apps/web)
npm run dev        # local hot-reload (skip Docker)
npm run build
npm run typecheck
npm run lint
```

## Architecture — what spans multiple files

### Single-host, two-network compose

`docker-compose.yml` defines two networks: `web` (caddy, nextjs, fastapi, postgres, redis) and `judge` (judge0-server, judge0-workers, judge0-postgres, judge0-redis). **Only `fastapi` is on both.** Judge0 is intentionally cut off from the web network so the sandbox cannot reach the app DB or the public proxy. Any new service that must talk to Judge0 belongs on the `judge` network via FastAPI, not directly.

### BFF auth — never expose FastAPI to the browser

The browser only ever talks to Next.js. Next.js calls FastAPI server-side with two headers:

- `X-Internal-Key` — shared secret (`API_INTERNAL_KEY`), verified by `apps/api/app/deps.py::require_internal_key`
- `X-User-Id` — UUID of the FastAPI user record, resolved by `apps/api/app/deps.py::current_user`

All FastAPI routes that need a user depend on `current_user`, which transitively requires `require_internal_key`. There is **no JWT verification, no CORS-from-browser path**. If you add an endpoint that the browser should reach, add it to a Next.js route handler / server action that calls FastAPI via `apps/web/src/lib/api.ts` — never call FastAPI from a client component.

### Two user tables in one Postgres — by design

There are two distinct user records:

1. **Auth.js Drizzle tables** (`apps/web/src/db/schema.ts`): `auth_users`, `auth_accounts`, `auth_verification_tokens`. Owned by Next.js. Holds OAuth account links + email-verify tokens only.
2. **FastAPI `users`** (`apps/api/app/models.py`): the real domain user with `role`, `status`, scores, etc. Owned by FastAPI.

They are linked by **email** and by the `backendId` field stashed on the Auth.js JWT. The **`jwt` callback** in `apps/web/src/lib/auth.ts` POSTs to `/users/upsert` (when `token.backendId` is missing), which creates the FastAPI user as `pending` if new, then stores the returned `id` on the token. Every subsequent BFF call sends that id as `X-User-Id`.

**Do not stash data on the `user` object in the `signIn` callback.** For OAuth-with-adapter flows, the `user` that `jwt()` receives is the adapter user loaded/created from `auth_users` — a different object — so the mutation is silently lost and every guarded page bounces back to `/sign-in` with no error logged. Credentials (dev login) passes the same object through, which masks the bug locally. The token is the only carrier that survives both flows.

A user signed in via Auth.js is still blocked by FastAPI until an admin flips `status` to `approved` (see `deps.py::current_user`). The Auth.js side has no concept of approval — keep it that way.

### Subtask scoring is split between Judge0 and FastAPI

Judge0 grades **one testcase at a time** and knows nothing about subtasks. FastAPI owns aggregation:

- Per problem: `scoring_mode` ∈ `ioi_strict | partial` (see `ScoringMode` in `models.py`).
- `ioi_strict`: subtask weight awarded iff all its testcases pass. First fail short-circuits the rest of that subtask (mark them `Verdict.skipped`).
- `partial`: subtask score = `(passed / total) * weight`. All cases run.
- Sum of `subtasks.weight` per problem must equal **100**.

The grader service (`apps/api/app/services/grader.py`) drives this:

- `submit` (router) takes a Redis rate-limit slot, persists the submission, returns immediately; fan-out runs in a FastAPI `BackgroundTasks` with a fresh session.
- `enqueue_submission` **commits all `SubmissionTestcase` rows before dispatching any testcase to Judge0** — Judge0 is fast (~300ms) and its callback runs in a separate session, so an uncommitted row would lose the verdict.
- Judge0 delivers verdicts via **HTTP PUT** to `callback_url` (not POST). The route `routers/judge0_callback.py` accepts both; the secret is the `key` query param (== `API_INTERNAL_KEY`).
- `on_callback` **locks the `Submission` row `FOR UPDATE`** first. Judge0 fires all per-testcase callbacks near-simultaneously; without serialization no single callback's snapshot sees every sibling verdict committed, so none would finalize. The lock serializes them; the last one recomputes `total_score`, sets `status=done`, upserts `UserProblemBest`, and releases the rate-limit slot.

Python's effective time limit = `problem.time_ms * problem.python_time_multiplier` (default 3×).

**Judge0 + cgroup v2 (WSL/modern hosts):** Judge0 1.13.1 bundles `isolate` 1.8.1, which needs **cgroup v1**. On cgroup-v2-only hosts (WSL2, modern distros) isolate fails with `Failed to create control group`. Workaround in `services/judge0.py`: every submission sets `enable_per_process_and_thread_time_limit` **and** `enable_per_process_and_thread_memory_limit` to `true`, which makes Judge0 drop `--cg` and use isolate's `-m` (address-space) limit instead — no cgroups needed (see `isolate_job.rb:57` in the image). Trade-off: memory is per-process address space, not total cgroup memory. Do not remove these flags unless the host is cgroup v1.

### Solution visibility gate

Hard rule, enforced in `apps/api/app/routers/submissions.py::get_submission`:

> A submission's source code is viewable iff `viewer == owner` OR `UserProblemBest(viewer, problem).best_score == 100`.

The DTO exposes a `can_view_source` boolean. `get_submission` only reads the source file from disk when the flag is true. Any new endpoint that returns submission code must apply this same check.

### Problem packages (testcase upload)

Setters upload a ZIP via `POST /problems/{slug}/testcases` (`routers/problems.py`, `require_setter`). `services/package.py` parses it:

- `config.yaml` at zip root (time/mem limits, `scoring_mode`, `python_time_multiplier`, `subtasks[]` with `name`/`weight`/`tests[]`). Weights **must** sum to 100 (pydantic-validated).
- `tests/N.in` + `tests/N.out` (or `.ann`/`.ans`), matched by basename so `tests/1.in` and `1.in` both work.

Upload **replaces** all subtasks+testcases for the problem: deletes existing rows, `storage.clear_problem_testcases` wipes the dir, then writes fresh files as `<problem_id>/<testcase_id>.in|.ans` and applies the config's limits onto the `Problem` row.

**Sample testcases** — `config.yaml` may carry a `samples:` list (inline `in`/`out`/`explanation`). These become a single `Subtask` with `is_sample=True`, `weight=0`, `ord=0` (scored subtasks shift to `ord≥1`). They are graded on every submission like any subtask but contribute **0 points** (weight 0). Unlike hidden testcases, their content is **public**: `get_problem` reads the sample subtask's files from disk and returns them in `ProblemDetail.samples` for display. Publish validation (`_validate_publishable`) sums only **non-sample** subtask weights to 100. Submission detail returns `subtasks[]` metadata (`ord`, `name`, `weight`, `is_sample`) so the UI can label the sample group and order subtasks.

### Ranking via denorm

`UserProblemBest` is the source of truth for the global leaderboard. It is **denormalized** — the grader service must update it on every completed submission:

```sql
-- conceptual upsert after each finished submission
INSERT INTO user_problem_best (user_id, problem_id, best_score, first_full_score_at)
VALUES (...)
ON CONFLICT (user_id, problem_id) DO UPDATE
SET best_score = GREATEST(user_problem_best.best_score, EXCLUDED.best_score),
    first_full_score_at = COALESCE(
      user_problem_best.first_full_score_at,
      CASE WHEN EXCLUDED.best_score = 100 THEN now() END
    );
```

Global ranking query:
```sql
SELECT user_id, SUM(best_score) AS total, MIN(first_full_score_at) AS first_full
FROM user_problem_best
GROUP BY user_id
ORDER BY total DESC, first_full ASC NULLS LAST;
```

Never recompute rank from `submissions` directly — always read `user_problem_best`.

### Problem search

`problems.search_vector` is a `tsvector` maintained by a Postgres trigger appended to the initial autogenerated migration (`alembic/versions/*_initial_schema.py`, weights: title A, statement B, constraints C). The list endpoint uses `plainto_tsquery('english', :q)` + a GIN index. Topic filtering uses an AND-match subquery in `routers/problems.py::list_problems` — adding a topic narrows results, not widens.

### Contests (live + virtual)

`services/contest.py` owns the time logic. A contest's **window** is `[start_at, start_at+duration]` for `live` (global clock) or `[participant.started_at, +duration]` for `virtual` (per-user; null until they hit "Start" → `POST /contests/{slug}/start`).

Contest problems may be **hidden** (`is_public=False`). `user_can_access_problem(session, user, problem)` = public **OR** admin/setter **OR** the user has an open window on some published contest containing that problem (`active_contest_for_problem`). This gate is wired into `routers/problems.py::get_problem` **and** `routers/submissions.py::submit`. On submit, the granting contest is found and stamped onto `Submission.contest_id` — that tag is what makes a submission count for the contest.

Scoreboard (`compute_scoreboard`, exposed at `GET /contests/{slug}/scoreboard`) aggregates **only `contest_id`-tagged submissions**: per problem take the max `total_score` and the earliest time reaching it; total = sum; tiebreak = earliest "lock" time (the latest of those per-problem first-best timestamps). Contest submissions still flow through the normal grader, so they also update the global `user_problem_best` (no special-casing).

Setter flow: `POST /contests` (draft) → add problems → `POST /contests/{slug}/publish` (needs ≥1 problem). Two ways to add problems: `POST /contests/{slug}/problems` (attach existing by slug+alias) or `POST /contests/{slug}/problems/new` (**create a fresh hidden problem** `slug=<contest>-<alias>`, attach, return its slug → setter then uploads testcases on `/manage/<slug>`). After the scheduled window ends (`contest_svc.globally_ended` = `now ≥ start_at+duration`), `POST /contests/{slug}/release` flips every contest problem to `is_public=True` — the gate is `ContestDetailOut.can_release`. `list_contests` shows drafts only to admin/setter. Frontend: `/contests`, `/contests/[slug]` (register/start + setter new-problem/attach/publish/release inline), `/contests/[slug]/scoreboard`, setter create form at `/manage/contests`.

### Frontend design system (pixel-art / dark arcade)

The UI is **dark-only, pixel-art themed**. Cohesion comes from a token + shared-component layer, not per-page styling:

- **Forced dark**: `globals.css` declares `@custom-variant dark (&:where(.dark, .dark *))` and `<html class="dark">` (`layout.tsx`). So `dark:` utilities always apply — never OS-dependent. Don't rely on `prefers-color-scheme`.
- **Tokens**: CSS vars in `globals.css` `:root` (`--bg`, `--surface`, `--border`, `--accent` amber, `--accent-2` teal, `--ac/--wa/--tle/...` verdicts). Reference as `text-[rgb(var(--accent))]` etc. The current palette is "cozy retro" (warm charcoal + cream + amber + teal).
- **Repurposed utility classes**: `.surface`, `.surface-hover`, `.bg-gradient-accent`, `.bg-gradient-hero`, `.text-gradient`, `.glow-accent`, `.pixel-btn`, `.pixel-chip` are defined in `globals.css`. They were named during an earlier gradient theme but now render pixel-art (solid fills, 3px borders, hard offset shadows). **Editing these classes restyles every page at once** — prefer that over per-page changes.
- **Square corners**: a global `*{ border-radius:0 !important }` enforces pixel corners. Don't add rounded utilities expecting them to show.
- **Fonts** (`layout.tsx`, `next/font`): Press Start 2P → headings + `.font-pixel` + buttons; VT323 → body (`--font-sans`); Silkscreen → labels; JetBrains Mono → code/verdicts. Root is `html{font-size:20px}` so all Tailwind `text-xs/sm/base` scale up (pixel fonts read small) — bump this single value to globally enlarge.
- **Shared components** (`components/ui.tsx`): `Button`/`LinkButton`, `Card`, `PageHeader`, `RankBadge` (gold/silver/bronze medals), `ScoreChip`, `ProgressBar` (segmented blocks), `VerdictBadge` + `VERDICT_TONE`, `StatCard`, `SolvedRing`, `StatusPill`, `Topic`. Use these instead of bespoke markup so the look stays consistent.
- **Pixel icons** (`components/pixel-icons.tsx`): no emoji anywhere. Icons are SVG grids (`Pixels` renders `<rect>` per filled cell, `shapeRendering=crispEdges`). **Grid strings use `1`/`#` for filled, `0`/`.` for empty** — the renderer matches `"1" || "#"`. Color via `currentColor` (pass a `text-[...]` className). Icons: `IconCheck/IconPartial/IconEmpty` (problem status), `IconStar`, `IconLock`, `IconTrophy`, `IconCross`, `IconHourglass`.

Web code is **not bind-mounted** — any frontend change needs `docker compose build nextjs && docker compose up -d nextjs caddy` (the `caddy` recreate matters: bringing up only `nextjs` can leave `caddy` stopped).

### Live verdicts = polling, by design (v1)

`apps/web/src/app/submissions/[id]/page.tsx` uses `<meta http-equiv="refresh" content="1">` while `status` is not terminal. No client JS, no SSE. When upgrading to SSE later, route the stream through Next.js (BFF) so the browser never directly contacts FastAPI.

### Testcase storage

Files live on a bind-mounted volume `./data/testcases/` (host) ↔ `/data/testcases/` (fastapi container). The DB stores **paths**, not bytes. The same volume is the unit of backup (`make backup` tars it). Judge0 does not see this volume — FastAPI reads testcase files and ships them inline to Judge0.

### Roles

`Role` ∈ `admin | setter | member`. Enforce via `deps.require_admin` / `deps.require_setter`. New signups are `UserStatus.pending`. Pending users may **browse** (read endpoints use `deps.current_user_not_banned`; frontend gate `guard.ts::requireUser`) but every write — submit, contest register/start — keeps the approved-only `current_user` gate. Banned users are blocked everywhere. Approvals go through `routers/admin.py` and write to `AuditLog`.

### Profiles + the username gate

`User.username` (nullable, unique, CITEXT, slug `^[a-z0-9_-]{3,30}$`) and `User.school` (nullable). Profiles are public to approved viewers at `/u/<username>` (`GET /users/by-username/<u>` → name, school, total score, global rank, and problems solved at 100; **never email**). Users self-edit name/username/school at `/settings` via `PATCH /users/me` (unique violation → 409).

`username` is set lazily (not on signup). The frontend `lib/guard.ts::requireApproved` redirects an approved user with a **null username to `/settings`** — the "pick a handle" gate. `/settings` and `/pending` must use the looser checks (`requireApprovedNoHandleGate` / direct `getMyStatus`) to avoid a redirect loop. `current_user_unverified` backs `/users/me/status` and `PATCH /users/me` so pending users can still set up their profile.

## Conventions

- IDs everywhere: UUID v4 (`Field(default_factory=uuid4)`).
- All timestamps timezone-aware UTC. Use the helpers in `models.py`: `_ts_default()` / `_ts_updated()` for non-null, **`_ts_nullable()` for any optional datetime** — a bare `datetime | None` field maps to a naive `timestamp` column and asyncpg will reject tz-aware writes.
- Cascade behavior: child rows `ON DELETE CASCADE`; soft links (e.g. `created_by_id`) `ON DELETE SET NULL`.
- Sessions: `db.SessionLocal` yields **SQLModel's** `AsyncSession` (from `sqlmodel.ext.asyncio.session`), which has `.exec()`. Plain SQLAlchemy `AsyncSession` only has `.execute()` — don't swap it.
- Drizzle URL strips `+asyncpg` from `DATABASE_URL` (see `apps/web/src/db/client.ts`); `alembic/env.py` instead maps it to `+psycopg` for the sync migration driver.

## Local dev gotchas

- **API code is bind-mounted** (`./apps/api:/app` in compose) so Python edits need only `docker compose restart fastapi` (plain uvicorn, no `--reload`) — no image rebuild. Web code is **not** mounted; Next.js changes need `docker compose build nextjs`.
- **Rebuilding nextjs invalidates server-action IDs.** Browser tabs loaded before the rebuild silently fail on any form submit (`Failed to find Server Action` in logs, nothing visible in the UI). After every `docker compose build nextjs`, hard-refresh open tabs before testing forms — "button does nothing" is almost always this, not a code bug.
- **Migrations**: `alembic.ini` has `prepend_sys_path = .`; the script template imports `sqlmodel`; `env.py` sets `include_name` to **skip `auth_*` tables** (Drizzle-owned) so autogenerate never tries to drop them. The Auth.js tables are created out-of-band (see `apps/web/src/db/schema.ts`) — currently by hand / `drizzle-kit`, not Alembic.
- **Next.js build** reads `DATABASE_URL` at import; `db/client.ts` falls back to a placeholder URL so `next build` can collect page data without a live DB (postgres-js connects lazily). Pages that branch on runtime env (e.g. `/sign-in` on `ENABLE_DEV_LOGIN`) must set `export const dynamic = "force-dynamic"` or the flag is captured at build time.
- **Dev login**: setting `ENABLE_DEV_LOGIN=true` adds an Auth.js Credentials provider (`id: "dev"`) for instant email-only login on `/sign-in` — local testing without OAuth. Gated by the env flag (the container runs `NODE_ENV=production`, so don't gate on NODE_ENV). Never enable in production.
- **Author CMS** lives under `/manage` (role-gated by `lib/guard.ts::requireSetter`). Publish is `POST /problems/{slug}/publish` (validates subtasks sum to 100, each non-empty). ZIP upload from the browser goes through the Next.js route handler `app/api/manage/problems/[slug]/testcases/route.ts`, which forwards multipart to FastAPI — the only multipart BFF path (the JSON `lib/api.ts` helpers can't carry files).
