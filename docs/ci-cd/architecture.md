# ShopCloud CI/CD Pipeline Architecture

## 1. Overview & Architectural Principles

ShopCloud's Continuous Integration and Continuous Deployment (CI/CD) architecture is built to ensure automated verification, immutable artifact generation, least-privilege cloud security, and deterministic zero-downtime deployments.

The delivery pipeline adheres to four fundamental architectural principles:
1. **Strict Zero-Cost Infrastructure Policy**: Production Cloud SQL instances remain `STOPPED` (`activationPolicy: NEVER`) during CI/CD runs. Validation in GitHub Actions relies strictly on GitHub-hosted ephemeral containers (e.g. `postgres:16-alpine`), preventing any avoidable GCP compute or storage spend ($0 / ₹0 spend maintained).
2. **Keyless GCP Authentication**: Long-lived service account JSON keys are strictly prohibited by GCP Organization Policy (`iam.disableServiceAccountKeyCreation`). GitHub Actions authenticates through Google Cloud Workload Identity Federation (WIF) via cryptographic OIDC token exchange.
3. **Immutable & Reproducible Artifacts**: Every container image pushed to Google Artifact Registry is permanently tagged with its Git commit SHA (`${GITHUB_SHA}`) and image digest (`sha256:...`). Mutating existing releases in production is prohibited.
4. **Isolated Validation Gates**: Continuous Integration (validation & testing) is completely decoupled from Continuous Deployment (Cloud Run traffic rollout). Deployment occurs only after automated CI checks have passed green.

```
                              ┌─────────────────────────────────────────┐
                              │            Developer Git Push           │
                              └────────────────────┬────────────────────┘
                                                   │
                         ┌─────────────────────────┴─────────────────────────┐
                         ▼                                                   ▼
              ┌─────────────────────┐                             ┌─────────────────────┐
              │ Pull Request Branch │                             │  main / Production  │
              └──────────┬──────────┘                             └──────────┬──────────┘
                         │                                                   │
                         ▼                                                   ▼
            ┌─────────────────────────┐                         ┌─────────────────────────┐
            │   ShopCloud CI Pipeline │                         │   ShopCloud CI Pipeline │
            │ - Ephemeral Postgres 16 │                         │ - Full Validation Suite │
            │ - Security & Secret Gate│                         └────────────┬────────────┘
            │ - Lint & Typecheck      │                                      │ (CI Passed)
            │ - Contract & DB Builds  │                                      ▼
            │ - Monorepo Test Suites  │                         ┌─────────────────────────┐
            │ - Docker Smoke Tests    │                         │  Workload Identity OIDC │
            └─────────────────────────┘                         └────────────┬────────────┘
                                                                             │ STS Exchange
                                                                             ▼
                                                                ┌─────────────────────────┐
                                                                │ Artifact Registry Push  │
                                                                │ - api:${SHA}            │
                                                                │ - web:${SHA}            │
                                                                │ - worker:${SHA}         │
                                                                └────────────┬────────────┘
                                                                             │
                                                                             ▼
                                                                ┌─────────────────────────┐
                                                                │ Controlled Cloud Run CD │
                                                                │ - Deploy api & web      │
                                                                │ - Post-Deploy Health OK │
                                                                │ - Ready for Traffic     │
                                                                └─────────────────────────┘
```

---

## 2. Pipeline Stages

| Stage | Responsibility | Runner / Environment | Cost Impact |
| :--- | :--- | :--- | :--- |
| **Stage 1: Validation & Build** | Clean dependency installation, secret leakage check, Prisma schema generation, monorepo contract builds, typecheck, linting, and unit/integration testing. | GitHub-hosted `ubuntu-latest` with ephemeral `postgres:16-alpine` service container. | **$0** (GitHub free-tier compute) |
| **Stage 2: Container Verification** | Multi-stage Docker builds using Buildx with GitHub Actions caching. Cloud Run contract validation via injected `$PORT` smoke tests. | GitHub-hosted `ubuntu-latest` | **$0** |
| **Stage 3: Image Publishing** | Short-lived OIDC exchange via Google WIF. Publishing versioned, immutable images to Artifact Registry. | GitHub Actions + Google Artifact Registry (`asia-south1`) | **Minimal/Free** (Standard GAR storage allowance) |
| **Stage 4: Controlled Deployment** | Deploy new revisions of `shopcloud-api` and `shopcloud-web` to Google Cloud Run with least-privilege IAM. | Google Cloud Run (`asia-south1`) | **$0** (Free tier invocation allowance; min-instances=0) |
| **Stage 5: Live Smoke Probes** | Automated HTTP curl validation of live endpoints (`/api/v1/health/liveness`, `/health`). | GitHub-hosted runner | **$0** |

---

## 3. Monorepo Dependency Flow

The monorepo workspaces are compiled in strict topological order to guarantee artifact consistency:

1. `@shopcloud/contracts`: Shared TypeScript DTOs and API contracts.
2. `@shopcloud/database`: Prisma schema generation and client compilation (`dist/index.js`).
3. `@shopcloud/api`: NestJS REST API Gateway.
4. `@shopcloud/workers`: Event-driven Pub/Sub background workers.
5. `@shopcloud/web`: React + Vite + Tailwind customer and admin storefront.
