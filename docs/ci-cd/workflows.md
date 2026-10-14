# ShopCloud GitHub Actions Workflows

This document details the configuration, triggers, job structures, and execution guarantees of each GitHub Actions workflow in ShopCloud.

---

## 1. ShopCloud CI Pipeline (`.github/workflows/ci.yml`)

The primary gate for all pull requests and branch pushes. No code can be merged into `develop` or `main` without successfully passing this pipeline.

### Triggers & Concurrency
- **Triggers**:
  - `pull_request` targeting `main` and `develop`.
  - `push` to `main`, `develop`, `feature/**`, and `fix/**`.
- **Concurrency Group**: `ci-${{ github.workflow }}-${{ github.event.pull_request.number || github.ref }}` with `cancel-in-progress: true` on PRs, terminating obsolete runs when new commits are pushed.

### Job 1: `validate` (Lint, Typecheck, Security & Test)
1. **Ephemeral PostgreSQL 16 Service**:
   - Boots `postgres:16-alpine` on port 5432 with health probe: `pg_isready -U shopcloud_ci -d shopcloud_ci`.
   - Injects throwaway environment: `DATABASE_URL=postgresql://shopcloud_ci:shopcloud_ci@localhost:5432/shopcloud_ci?schema=public`.
2. **Deterministic Setup**:
   - Installs Node.js 22 LTS with `npm` cache enabled.
   - Executes clean dependency installation: `npm ci`.
3. **Security Gate**:
   - Executes `node scripts/ci-security-check.js`.
   - Verifies that no `.env` files or certificates are tracked in Git.
   - Scans files for accidental private keys or service account markers.
   - Evaluates production dependency vulnerabilities via `npm audit --omit=dev --audit-level=critical`.
4. **Compilation Order**:
   - `@shopcloud/contracts`: `npm run build --workspace=@shopcloud/contracts`
   - `@shopcloud/database`: `npm run db:generate` & `npm run build --workspace=@shopcloud/database`
   - Applies migrations to ephemeral container: `npm run db:migrate:deploy`
   - Seeds ephemeral database: `npm run db:seed`
5. **Code Quality Gates**:
   - Monorepo Typecheck: `npm run typecheck` across all 5 workspaces (`tsc --noEmit`).
   - Monorepo Lint: `npm run lint`.
6. **Workspace Builds**:
   - Builds `@shopcloud/api`, `@shopcloud/workers`, and `@shopcloud/web`.
7. **Monorepo Test Suites**:
   - Executes `npm test` across workspaces, running unit and database integration tests.
8. **Summary Output**:
   - Writes a structured markdown summary to `$GITHUB_STEP_SUMMARY`.

### Job 2: `docker` (Docker Build & Smoke Test Matrix)
- Runs a matrix for `api`, `web`, and `worker`.
- Uses `docker/setup-buildx-action@v3` with GitHub Actions cache (`type=gha`).
- **Cloud Run Contract Smoke Test**:
  - Boots the built image in a container injecting `PORT=8080`.
  - Probes the service endpoint:
    - `api`: `/api/v1/health/liveness` (ensures container boots in production without requiring database connectivity).
    - `web`: `/health`
    - `worker`: `/health`
  - Verifies HTTP 200 response within 30 seconds.
- Validates local Compose configuration: `docker compose -f compose.yaml config --quiet`.

---

## 2. Build & Push Images (`.github/workflows/build-images.yml`)

Publishes production container images to Google Artifact Registry using Workload Identity Federation (WIF).

### Triggers & Concurrency
- **Triggers**:
  - `push` to `main` and `develop`.
  - `push` of release tags: `v*`.
  - Manual execution via `workflow_dispatch`.
- **Concurrency Group**: `build-images-${{ github.workflow }}-${{ github.ref }}` with `cancel-in-progress: false`.

### Workflow Steps
1. **Keyless Authentication**:
   - Exchanges GitHub OIDC token with Google Cloud STS using `google-github-actions/auth@v2`.
   - Impersonates `shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com`.
2. **Artifact Registry Login**:
   - Authenticates Docker CLI to `asia-south1-docker.pkg.dev` using temporary OAuth access token.
3. **Semantic & Immutable Tag Computation**:
   - Commits are tagged with both full SHA (`:${GITHUB_SHA}`) and short SHA (`:${GITHUB_SHA::7}`).
   - Release tags receive the git tag name (e.g. `:v1.2.0-phase12`).
   - Pushes to `main` receive `:latest`.
4. **Build & Push Matrix**:
   - Builds `Dockerfile.api`, `Dockerfile.web`, and `Dockerfile.worker`.
   - Pushes to `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/<service>`.
5. **Digest Recording**:
   - Captures unique immutable sha256 image digest and writes to `$GITHUB_STEP_SUMMARY`.

---

## 3. ShopCloud CD Pipeline (`.github/workflows/deploy.yml`)

Automates controlled Cloud Run deployments to `shopcloud-api` and `shopcloud-web` with post-deployment health verification and instant rollback runbooks.

### Triggers & Gatekeeping
- **Trigger**: `workflow_run` after `ShopCloud CI Pipeline` succeeds on `main`, or manual `workflow_dispatch`.
- **Preflight Job**: Verifies that required WIF parameters and permissions are present before starting any deployment activity.

### Deployment Process
1. **Container Image Publishing**:
   - Re-verifies and pushes container images pinned to the deployment commit SHA.
2. **Pre-deployment State Capture**:
   - Inspects existing Cloud Run revisions using `gcloud run services describe` to record previous stable revisions for rollback.
3. **Cloud Run Service Updates**:
   - Deploys `shopcloud-api` using image `${REGION}-docker.pkg.dev/${PROJECT_ID}/${GAR_REPOSITORY}/api:${DEPLOY_SHA}`.
   - Deploys `shopcloud-web` using image `${REGION}-docker.pkg.dev/${PROJECT_ID}/${GAR_REPOSITORY}/web:${DEPLOY_SHA}`.
4. **Post-Deployment Smoke Verification**:
   - Probes live API URL: `${API_URL}/api/v1/health/liveness` (retries for cold-start tolerance).
   - Probes live Web URL: `${WEB_URL}/health`.
5. **Observability & Rollback Runbook**:
   - Automatically writes live service URLs, deployed commit SHAs, and pre-computed rollback commands to `$GITHUB_STEP_SUMMARY`.

---

## 4. GCP WIF Check (`.github/workflows/gcp-wif-check.yml`)

Read-only security proof verifying that GitHub Actions can authenticate through Workload Identity Federation, impersonate the deployer identity, and confirm that least privilege is actively enforced.
