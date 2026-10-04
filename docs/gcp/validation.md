# Phase 6 Validation

All results below are real output captured on 2026-10-04 with gcloud SDK 533.0.0
(configuration `shopcloud`, account `chaudaki08@gmail.com`). Nothing is inferred.

## 1. GCP validation

| # | Check | Command | Actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | Active project | `gcloud config list` | `project = project-c3f386b1-6c37-468d-8ee` | **PASS** |
| 2 | Project number | `gcloud projects describe project-c3f386b1-6c37-468d-8ee` | `projectNumber: '24903284190'`, `lifecycleState: ACTIVE`, name `ShopCloud Dev`, 4 labels | **PASS** |
| 3 | Region | architecture decision (no project default existed) | `asia-south1` | **PASS** |
| — | Billing | `gcloud billing projects describe …` | `billingEnabled: false`; billing account `01580E-E37F69-97296D` `open: false` | **MANUAL ACTION REQUIRED** |
| 4 | Foundation APIs | `gcloud services list --enabled` | `cloudresourcemanager`, `iam`, `iamcredentials`, `sts`, `serviceusage`, `logging`, `monitoring` enabled | **PASS** |
| 4a | Artifact Registry / Secret Manager APIs | `gcloud services enable artifactregistry.googleapis.com` (and `secretmanager…`) | `FAILED_PRECONDITION: Billing account for project '24903284190' is not found. Billing must be enabled …` | **MANUAL ACTION REQUIRED** |
| 4b | Deferred APIs not enabled | `gcloud services list --enabled` | `run`, `sqladmin`, `pubsub`, `container`, `gkehub` absent (`storage` present as a Google default) | **PASS** |
| 5 | Artifact Registry repository | `gcloud artifacts repositories list --location=asia-south1` | no repositories (API disabled) | **MANUAL ACTION REQUIRED** |
| 6 | Service accounts | `gcloud iam service-accounts list` | `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` | **PASS** |
| 6a | No user-managed keys | `gcloud iam service-accounts keys list --iam-account=<sa>` | only one `SYSTEM_MANAGED` key each; 0 `USER_MANAGED` | **PASS** |
| 6b | No broad project roles | `gcloud projects get-iam-policy …` | only `roles/owner user:chaudaki08@gmail.com` | **PASS** |
| 6c | Key creation blocked | `gcloud resource-manager org-policies describe iam.disableServiceAccountKeyCreation --project=… --effective` | `booleanPolicy: enforced: true` | **PASS** |
| 7 | WIF pool / provider | `gcloud iam workload-identity-pools [providers] describe …` | pool `ACTIVE`; provider `ACTIVE`, condition `assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'` | **PASS** |
| 7a | WIF end-to-end | GitHub Actions `GCP WIF Check` | run `37189323203`: `Token issued for: shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | **PASS** |
| 8 | Secret Manager | `gcloud secrets list` | `API [secretmanager.googleapis.com] not enabled` | **MANUAL ACTION REQUIRED** |
| 9 | Logging | `gcloud logging buckets list`; `gcloud logging read 'protoPayload.serviceName="iamcredentials.googleapis.com"'` | `_Default` 30 d ACTIVE, `_Required` 400 d ACTIVE; `GenerateAccessToken` audit entry returned | **PASS** |
| 10 | Monitoring | `GET https://monitoring.googleapis.com/v3/projects/…/metricDescriptors?pageSize=1` | HTTP `200`; `alertPolicies` list empty | **PASS** |
| — | Budgets | `gcloud billing budgets list --billing-account=01580E-E37F69-97296D` | `billingbudgets.googleapis.com` not enabled; no budget exists | **MANUAL ACTION REQUIRED** |

### WIF troubleshooting note

The first WIF run (`37189060205`) failed with `Permission 'iam.serviceAccounts.getAccessToken' denied` about two minutes
after the IAM binding was created; the STS exchange in that run had already succeeded. A rerun after IAM propagation
reached the impersonation step successfully, and the identity check passed once the token requested the
`userinfo.email` scope (needed for `tokeninfo` to report the email).

## 2. Application validation (local, Windows, Node 22.18.0, npm 10.9.3)

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Prisma schema | `npx prisma validate --schema=packages/database/prisma/schema.prisma` | `The schema … is valid` | **PASS** |
| Prisma client | `npm run db:generate` | exit 0 | **PASS** |
| Migrations | `npm run db:status` | `2 migrations found`, `Database schema is up to date!` | **PASS** |
| Build | `npm run build` (after contracts → database) | exit 0 | **PASS** |
| TypeScript | `tsc --noEmit -p .` in api, workers, web, contracts, database | all exit 0 | **PASS** |
| Tests | `npm test` | API **81/81** (8 suites); `@shopcloud/database` integration suite passed | **PASS** |
| Docker | `docker build` | **NOT AVAILABLE** — Docker daemon unavailable in this environment; images are built by the CI `docker` job instead | **NOT AVAILABLE** (local) / **PASS** (CI) |

## 3. GitHub Actions (feature/gcp-foundation)

| Run | Workflow | Commit | Result |
| --- | --- | --- | --- |
| 37189060116 | ShopCloud CI Pipeline | `3be90a1` | success (build, 81 tests, DB tests, 3 Docker images) |
| 37189323181 | ShopCloud CI Pipeline | `e3e3e65` | success |
| 37189060205 | GCP WIF Check | `3be90a1` | failure → IAM propagation, then identity-check scope (see above) |
| 37189323203 | GCP WIF Check | `e3e3e65` | **success** |

The CI fix from `fix(ci): resolve github actions pipeline failures` was already merged before Phase 6; Phase 6 does not
change `ci.yml` or `deploy.yml`. CD is unaffected: its secrets remain unset by design (see [iam.md §5](iam.md#5-values-for-the-cd-workflow-phase-12)).
