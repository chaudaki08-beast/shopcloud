# ShopCloud — Google Cloud Platform (Phase 6: GCP Foundation)

Phase 6 establishes the GCP platform baseline **without provisioning application infrastructure**.
Everything below was created or observed with real `gcloud` output on 2026-10-04 — see [validation.md](validation.md).

## Status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| GCP project | **PASS** | `project-c3f386b1-6c37-468d-8ee` (#`24903284190`), display name "ShopCloud Dev", labelled |
| Billing | **PASS** | Linked to `My Billing Account 1` (`019096-A2B4E0-C3697C`, INR, open) |
| Foundation APIs | **PASS** | IAM, IAM Credentials, STS, Resource Manager, Service Usage, Logging, Monitoring, Artifact Registry, Secret Manager, Cloud Billing, Billing Budgets |
| Artifact Registry | **PASS** | Docker repository `shopcloud` in `asia-south1`, cleanup policy active, deployer has writer on this repo only; no images pushed |
| Secret Manager | **PASS** | 3 secret containers (no values) in `asia-south1` with per-secret accessor bindings |
| Service accounts | **PASS** | `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` — zero project roles, resource-scoped grants only |
| Workload Identity Federation | **PASS** | Pool + GitHub OIDC provider restricted to repo ID `1401646031`; verified end-to-end from GitHub Actions, including least-privilege allow/deny checks |
| Cloud Logging | **PASS** | API enabled, `_Default` (30 d) / `_Required` (400 d) buckets, audit entries readable |
| Cloud Monitoring | **PASS** | API enabled, Monitoring API responds `200`; no dashboards/alerts (Phase 14) |
| Budget alerts | **PASS** | `shopcloud-dev-monthly`: ₹500/month, alerts at 50/90/100 %, scoped to this project |
| Cloud Run readiness | **PASS** (code) | 6 issues fixed + production auth hardening; runtime config listed in [foundation.md §9](foundation.md#9-cloud-run-readiness-review) |
| Cloud Run (Phase 7) | **PASS** | `shopcloud-api` + `shopcloud-web` live; database-backed features **DEFERRED TO PHASE 8** — see [cloud-run.md](cloud-run.md) |
| Worker service | **DEFERRED** (Phase 10) | Push delivery ready; no Pub/Sub topics yet |
| Terraform | **DEFERRED** (Phase 13) | Strategy in [foundation.md §10](foundation.md#10-terraform-strategy) |

## Documents

| File | Contents |
| --- | --- |
| [foundation.md](foundation.md) | Project, region, environments, APIs, Artifact Registry, naming & labels, logging, monitoring, cost control, Cloud Run readiness, Terraform strategy |
| [iam.md](iam.md) | Identities, least-privilege role plan, Workload Identity Federation design and GitHub restriction |
| [security.md](security.md) | Secret Manager strategy, credential policy, repository credential scan |
| [cloud-run.md](cloud-run.md) | Phase 7: services, URLs, images, IAM, secrets, probes, scaling, rollback, limitations |
| [validation.md](validation.md) | Commands run and their actual results |

## Working with the project locally

ShopCloud uses a **dedicated gcloud configuration** so it never collides with other projects on the machine:

```bash
gcloud config configurations activate shopcloud   # account chaudaki08@gmail.com, project project-c3f386b1-6c37-468d-8ee
gcloud config configurations activate default     # switch back to other work
```

## Live endpoints (Phase 7)

- Web: https://shopcloud-web-24903284190.asia-south1.run.app
- API: https://shopcloud-api-24903284190.asia-south1.run.app (health: `/api/v1/health/liveness`)

Not yet created: Cloud SQL (Phase 8), application buckets (9), Pub/Sub topics (10), GKE (17), Terraform (13),
automated deployment (12).
