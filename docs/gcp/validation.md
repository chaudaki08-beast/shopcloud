# Phase 6 Validation

All results below are real output captured on 2026-10-04 with gcloud SDK 533.0.0
(configuration `shopcloud`, account `chaudaki08@gmail.com`, quota project `project-c3f386b1-6c37-468d-8ee`).
Nothing is inferred.

## 1. GCP validation

| # | Check | Command | Actual result | Status |
| --- | --- | --- | --- | --- |
| 1 | Active project | `gcloud config list` | `project = project-c3f386b1-6c37-468d-8ee` | **PASS** |
| 2 | Project number | `gcloud projects describe project-c3f386b1-6c37-468d-8ee` | `24903284190`, `ACTIVE`, name `ShopCloud Dev`, 4 labels | **PASS** |
| 3 | Region | architecture decision (no project default existed) | `asia-south1` | **PASS** |
| 3a | Billing | `gcloud billing projects describe …` | `billingEnabled: true`, `billingAccounts/019096-A2B4E0-C3697C` (INR, open) | **PASS** |
| 3b | Budget | `gcloud billing budgets list --billing-account=019096-A2B4E0-C3697C` | `shopcloud-dev-monthly 500 INR`, thresholds 0.5 / 0.9 / 1.0, filter `projects/24903284190` | **PASS** |
| 4 | Foundation APIs | `gcloud services list --enabled` | `artifactregistry`, `billingbudgets`, `cloudbilling`, `cloudresourcemanager`, `iam`, `iamcredentials`, `logging`, `monitoring`, `secretmanager`, `serviceusage`, `sts` (+ Google default `storage`) | **PASS** |
| 4a | Deferred APIs not enabled | `gcloud services list --enabled` | `run`, `sqladmin`, `pubsub`, `container`, `gkehub` absent | **PASS** |
| 5 | Artifact Registry repository | `gcloud artifacts repositories list --location=asia-south1` | `shopcloud DOCKER 0` bytes; `docker images list` → 0 images | **PASS** |
| 5a | Cleanup policy | `gcloud artifacts repositories describe shopcloud --location=asia-south1` | `keep-latest-10`, `delete-untagged-7d`, `delete-older-30d`; not dry-run | **PASS** |
| 6 | Service accounts | `gcloud iam service-accounts list` | `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` | **PASS** |
| 6a | No user-managed keys | `gcloud iam service-accounts keys list --managed-by=user` | 0 / 0 / 0 | **PASS** |
| 6b | No ShopCloud project-level roles | `gcloud projects get-iam-policy …` | only `roles/owner user:chaudaki08@gmail.com` and Google's `roles/artifactregistry.serviceAgent` | **PASS** |
| 6c | Key creation blocked | `gcloud resource-manager org-policies describe iam.disableServiceAccountKeyCreation --effective` | `enforced: true` | **PASS** |
| 7 | WIF pool / provider | `gcloud iam workload-identity-pools providers describe github-actions …` | `ACTIVE`, condition `assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'` | **PASS** |
| 7a | WIF end-to-end | GitHub Actions `GCP WIF Check` | run `37192436373`: `Token issued for: shopcloud-github-deployer@…` | **PASS** |
| 7b | Deployer least privilege | same run | registry read **200**; secret read **403**; project IAM policy **403** | **PASS** |
| 8 | Secret Manager | `gcloud secrets list`; `versions list`; `get-iam-policy` | 3 secrets, 0 versions each, `asia-south1`, accessors as in [security.md](security.md) | **PASS** |
| 9 | Logging | `gcloud logging buckets list`; `gcloud logging read …` | `_Default` 30 d, `_Required` 400 d; `GenerateAccessToken` audit entries returned | **PASS** |
| 10 | Monitoring | `GET monitoring.googleapis.com/v3/projects/…/metricDescriptors?pageSize=1` | HTTP `200`; no alert policies or dashboards (Phase 14) | **PASS** |

### Troubleshooting notes

- **Billing (resolved):** the original billing account `01580E-E37F69-97296D` was closed, so enabling Artifact Registry and
  Secret Manager failed with `FAILED_PRECONDITION: Billing account for project '24903284190' is not found`. The owner opened
  `019096-A2B4E0-C3697C`; the project was then linked with `gcloud billing projects link` (owner-approved).
- **Billing API rate limit:** without a quota project, gcloud billing calls run against Google's shared gcloud client project,
  which returned `RESOURCE_EXHAUSTED … cloudbilling.googleapis.com`. Fixed by enabling `cloudbilling.googleapis.com` and
  setting `billing/quota_project` in the `shopcloud` configuration.
- **WIF first run:** run `37189060205` failed with `Permission 'iam.serviceAccounts.getAccessToken' denied` two minutes after the
  IAM binding was created (propagation). A rerun succeeded; the identity check additionally needed the `userinfo.email` scope.

## 2. Application validation (local, Windows, Node 22.18.0, npm 10.9.3)

| Check | Command | Result | Status |
| --- | --- | --- | --- |
| Prisma schema | `npx prisma validate` | valid | **PASS** |
| Migrations | `npm run db:status` | 3 migrations, `Database schema is up to date!` | **PASS** |
| Build | `npm run build` (after contracts → database) | exit 0 | **PASS** |
| TypeScript | `tsc --noEmit` in api, workers, web, contracts, database | all exit 0 | **PASS** |
| Tests | `npm test` | API **101/101** (11 suites), worker **6/6**, `@shopcloud/database` integration suite passed | **PASS** |
| Docker | `docker build` | **NOT AVAILABLE** locally — Docker daemon unavailable in this environment | **NOT AVAILABLE** (local) |
| Docker (CI) | CI `docker` job | 3 images build; web and worker containers healthy on `PORT=8080` | **PASS** |

## 3. GitHub Actions

| Run | Workflow | Result |
| --- | --- | --- |
| 37189323203 | GCP WIF Check | success — identity verified |
| 37190026916 | GCP WIF Check (develop) | success |
| 37191577215 | ShopCloud CI Pipeline (develop, after Cloud Run readiness fixes) | success — build, tests, 3 images, container smoke tests |
| 37192436373 | GCP WIF Check (least-privilege checks) | success — 200 / 403 / 403 |

CD remains intentionally unconfigured (its secrets are unset until Phase 12 — see [iam.md §5](iam.md#5-values-for-the-cd-workflow-phase-12)).
