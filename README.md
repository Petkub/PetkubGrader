# MyGrader

Competitive-programming grader. C++ + Python. IOI-style subtasks. Virtual contests.

## Stack

| Layer        | Tech                                                          |
|--------------|---------------------------------------------------------------|
| Reverse proxy| Caddy 2 (auto-HTTPS in prod)                                  |
| Frontend     | Next.js 16 (App Router) + Tailwind v4 + shadcn/ui + Monaco    |
| Auth         | Auth.js v5 — Google + GitHub OAuth + magic link (Resend)      |
| Backend      | FastAPI + SQLModel + asyncpg + Alembic                        |
| DB           | Postgres 16 (FTS via `tsvector` + GIN)                        |
| Cache/queue  | Redis 7                                                       |
| Grader       | Judge0 self-hosted (server + workers + own DB/Redis)          |

## One-VPS deployment

```
                 ┌─────────────────────────────────┐
internet ───────►│ Caddy :80/:443 (auto-HTTPS)     │
                 │       │                          │
                 │       ▼                          │
                 │    Next.js :3000  (browser BFF)  │
                 │       │                          │
                 │       ▼                          │
                 │    FastAPI :8000 ───► Postgres   │
                 │       │              Redis      │
                 │       ▼                          │
                 │    Judge0 server  ──►  workers   │
                 │      (isolate sandbox)           │
                 └─────────────────────────────────┘
                       data/testcases/ (volume)
```

## Quickstart (dev on WSL)

```bash
cp .env.example .env
# generate AUTH_SECRET
openssl rand -base64 32   # paste into .env as AUTH_SECRET
# generate API_INTERNAL_KEY + JUDGE0_AUTH_TOKEN
openssl rand -hex 32      # paste twice into .env

# (optional) fill OAuth creds in .env from
#   https://console.cloud.google.com/apis/credentials
#   https://github.com/settings/developers
# (optional) fill AUTH_RESEND_KEY from resend.com

make build
make up
make migrate-init   # autogenerate tables migration
# review apps/api/alembic/versions/*tables* before applying
make migrate
make seed-topics

open http://localhost
```

## Roles

| Role     | Capability                                              |
|----------|---------------------------------------------------------|
| `admin`  | Approve users, set roles, everything else               |
| `setter` | Create/edit problems, manage contests                   |
| `member` | Solve, submit                                           |

New sign-ups are `pending` until an admin approves them.

### Bootstrap your first admin

After first sign-in:

```bash
make shell-db
# inside psql:
UPDATE users SET role='admin', status='approved' WHERE email='you@example.com';
```

## Solution visibility

A user can view another user's submission source **only if** they have already
reached score 100 on that problem. Enforced in `routers/submissions.py::get_submission`.

## Subtask scoring

Two modes, configurable per problem:

- **`ioi_strict`** — subtask gives full weight iff every testcase in it passes. First fail short-circuits remaining cases in the subtask.
- **`partial`** — subtask score = `(passed / total) * weight`. Runs all cases.

Per-problem max = sum of subtask weights = **100**.

## Ranking

```sql
ORDER BY SUM(best_score) DESC,
         MIN(first_full_score_at) ASC NULLS LAST
```

`user_problem_best` is updated by the grader service when a submission finishes.

## Testcase upload format

ZIP with:

```
config.yaml
tests/
  1.in
  1.out
  2.in
  2.out
  …
```

```yaml
# config.yaml
time_ms: 1000
memory_mb: 256
scoring_mode: ioi_strict   # or: partial
python_time_multiplier: 3.0
subtasks:
  - name: "n ≤ 100"
    weight: 30
    tests: [1, 2, 3]
  - name: "n ≤ 10^5"
    weight: 70
    tests: [4, 5, 6, 7, 8]
```

## Backups (prod)

```bash
make backup
# Then push backups/ to Backblaze B2 via restic (set up cron)
```

## Roadmap

- [ ] Grader service — wire FastAPI → Judge0 with per-testcase callback aggregation
- [ ] Admin pending-users UI
- [ ] Problem author CMS (ZIP upload + statement editor)
- [ ] Contest scoreboard (live + virtual)
- [ ] Per-testcase live verdicts (polling v1, SSE later)
- [ ] Custom testlib checker (v2)
- [ ] Domain + TLS (when ready)
