# GitHub Actions Troubleshooting — CI/CD Failure Incident (2026-10-04)

> Scope: CI/CD infrastructure correction. No application behaviour changed; no phase status changed
> (Phase 5 remains **COMPLETE**, Phase 6 remains **NEXT**).

## 1. Failure observed

Every GitHub Actions run since the first commit (`5fab75e`, `chore(repo): initialize ShopCloud repository`)
was red — 25 consecutive runs across Phases 1–5, on both `main` and `develop`.

## 2. Affected workflows

| Workflow | File | Runs | Failing job → first failing step |
| --- | --- | --- | --- |
| ShopCloud CI Pipeline | `.github/workflows/ci.yml` | #1 – #19 (all) | `Lint, Build & Test` → **Build Backend API** |
| ShopCloud CD Pipeline | `.github/workflows/deploy.yml` | #1 – #6 (all) | `Build, Push to GAR & Deploy to Cloud Run` → **Authenticate to Google Cloud via Workload Identity Federation** |

Representative runs (identical failure in every phase):

| Phase | CI run (ID) | CD run (ID) | Commit |
| --- | --- | --- | --- |
| 1 | #1 (37011917488) | #1 (37011917533) | `5fab75e` |
| 2 | #13 (37109815942) | #3 (37109815875) | `05e459d` |
| 3 | #15 (37120600880) | #4 (37120600879) | `e0c4292` |
| 4 | #17 (37147656581) | #5 (37147656580) | `b693806` |
| 5 | #19 (37149002726) | #6 (37149002689) | `18ddf59` |

There is no separate release/tag workflow: `chore(release)` commits failed only because they are pushes to
`main`/`develop` that trigger the two workflows above. Tags trigger nothing.

## 3. Root cause

### 3.1 CI — `@shopcloud/database` was never built (present since Phase 1)

```
src/modules/products/products.service.ts:6:32 - error TS2307:
Cannot find module '@shopcloud/database' or its corresponding type declarations.
Found 11 error(s).
```

`packages/database/package.json` resolves the package to `dist/index.js` / `dist/index.d.ts`, and `dist/` is
gitignored. The CI job ran `Build Contracts` → `Generate Prisma Client` → `Build Backend API` but never ran
`npm run build --workspace=@shopcloud/database`, so on a clean runner the API (and workers) could not resolve the
package. Reproduced byte-for-byte in a fresh clone at `5fab75e`, `b8eb90f`, `05e459d` and `18ddf59`.

### 3.2 Latent CI defects hidden behind 3.1

These would have failed the pipeline as soon as 3.1 was fixed:

1. **No database for tests; tests never ran in CI.** The API Jest specs and `@shopcloud/database` integration
   tests require a migrated, seeded PostgreSQL. The workflow had no Postgres service and no `npm test` step.
2. **`dotenv` binary collision.** `@shopcloud/api` depended on `dotenv@^18`, which ships its own `dotenv` CLI
   (`dotenv run -f …`). The root devDependency `dotenv-cli@11` also installs a `dotenv` binary. Both hoist to
   `node_modules/.bin/dotenv`; on a clean `npm ci` the `dotenv@18` CLI wins, so every
   `dotenv -e ../../.env -- …` script (`db:generate`, `db:migrate:deploy`, `db:seed`, database `test`) exits with
   a usage error. Developer machines kept the older `dotenv-cli` link from install history, masking it.
3. **Dockerfiles had the same ordering bug.** `Dockerfile.api` and `Dockerfile.worker` generated the Prisma client
   but never built `@shopcloud/database`, then `COPY`'d `packages/database/dist` into the runtime stage. The
   images could not build. CI never built images, so Phase 5 shipped this undetected.

### 3.3 CD — missing GCP secrets (environmental, not code)

```
google-github-actions/auth failed with: the GitHub Action workflow must specify exactly one of
"workload_identity_provider" or "credentials_json"!
```

The repository secrets `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER` and `GCP_WIF_SERVICE_ACCOUNT` are not configured
(GCP infrastructure is Phase 6/12 scope). In addition, CD ran on every push to `main` **in parallel with CI**, so
it would have deployed even when CI failed, and it referenced stale Dockerfile paths (`apps/*/Dockerfile`
instead of the Phase 5 root `Dockerfile.api` / `Dockerfile.worker`).

## 4. Why local tests passed

- Local `packages/database/dist` existed from earlier builds, so TS2307 never appeared.
- The local `node_modules/.bin/dotenv` still pointed at `dotenv-cli` from install history.
- Local PostgreSQL (`.pgdata`, port 5433) was already migrated and seeded, and `.env` supplied `DATABASE_URL`.

## 5. Why GitHub Actions failed

A GitHub runner is a clean checkout: no `dist/`, no `.env`, no database, fresh `npm ci` binary linking, and no
repository secrets for GCP. Every implicit local assumption above was absent.

## 6. Fix applied

| File | Change |
| --- | --- |
| `.github/workflows/ci.yml` | Explicit build order `contracts → db:generate → database → migrate deploy → seed → api / workers / web → npm test`; `postgres:16-alpine` service with `pg_isready` health check and CI-only throwaway credentials; new `docker` matrix job building `Dockerfile.api` / `.worker` / `.web` (no push, GHA layer cache) plus `docker compose config` validation; `permissions: contents: read`; `timeout-minutes`; PR-scoped concurrency cancellation; push triggers extended to `feature/**` and `fix/**`; `actions/checkout@v5` / `setup-node@v5` (Node 24 runtime). |
| `.github/workflows/deploy.yml` | Triggered by `workflow_run` after **successful** CI on `main` (plus manual dispatch on `main`); `preflight` job reports missing secret names as a warning + step summary and skips `deploy` instead of crashing; `id-token: write` scoped to the deploy job only; deploys the exact CI-validated SHA; Dockerfile paths corrected to `Dockerfile.api` / `Dockerfile.worker`. |
| `Dockerfile.api`, `Dockerfile.worker` | Added `RUN npm run build --workspace=@shopcloud/database` after `prisma generate`. |
| `apps/api/package.json`, `package-lock.json` | `dotenv` `^18.0.5` → `^17.4.2` (same `config()` API, no CLI binary), removing the `.bin/dotenv` collision with `dotenv-cli`. |

No tests were skipped, no `continue-on-error` was added, and no real credentials were committed.

## 7. Validation

Local (Windows, Node 22.18.0, npm 10.9.3):

- Clean clone + fixed workflow sequence against a brand-new empty database, env vars only, no `.env` file:
  all builds pass, **81/81** API tests (8 suites), all `@shopcloud/database` integration tests pass.
- Docker builder stages simulated (partial-workspace `npm ci` + build steps): API, worker and web pass;
  the original worker order fails as expected. (Docker is not installed locally; real image builds are
  validated by the CI `docker` job.)
- Working tree: `npm run build` ✅, `npm test` ✅ (81/81 + database suite), `git diff --check` ✅.

GitHub Actions results are recorded in the merge commit / PR history for `feature/fix-github-actions`.

## 8. Future prevention

- **Never depend on gitignored build output implicitly.** Any workspace consumed via `dist/` must be built in CI
  before its consumers.
- **Root `npm run build` ordering:** npm runs workspaces in path order (`apps/*` before `packages/*`), so on a
  fresh clone the root build also needs `db:generate` and the `contracts` / `database` builds first. Consider
  making the root `build` script explicitly ordered.
- **API tests need `DATABASE_URL` in the environment.** `apps/api`'s `test` script is plain `jest` and does not
  load `.env`; export it (or run via `dotenv -e ../../.env --`) when running locally.
- **Avoid duplicate CLI binary names** across dependencies (`dotenv` vs `dotenv-cli`).
- **Treat a red default branch as an incident** — this failure went unnoticed for 25 runs.
- **MANUAL ACTION REQUIRED before deployment (Phase 6/12):** configure repository secrets
  `GCP_PROJECT_ID`, `GCP_WIF_PROVIDER`, `GCP_WIF_SERVICE_ACCOUNT`.
