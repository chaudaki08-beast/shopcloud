# ShopCloud — Google Cloud Platform (Phase 6: GCP Foundation)

Phase 6 establishes the GCP platform baseline **without provisioning application infrastructure**.
Everything below was created or observed with real `gcloud` output on 2026-10-04 — see [validation.md](validation.md).

## Status at a glance

| Area | Status | Notes |
| --- | --- | --- |
| GCP project | **PASS** | `project-c3f386b1-6c37-468d-8ee` (#`24903284190`), display name "ShopCloud Dev", labelled |
| Billing | **MANUAL ACTION REQUIRED** | Billing account `My Billing Account` is **closed**; project has no billing |
| Foundation APIs (billing-free) | **PASS** | IAM, IAM Credentials, STS, Resource Manager, Service Usage, Logging, Monitoring |
| Artifact Registry | **MANUAL ACTION REQUIRED** | API cannot be enabled without billing; repository `shopcloud` designed, not created |
| Secret Manager | **MANUAL ACTION REQUIRED** | API cannot be enabled without billing; naming/access strategy documented |
| Service accounts | **PASS** | `shopcloud-api-runtime`, `shopcloud-worker-runtime`, `shopcloud-github-deployer` — zero project roles |
| Workload Identity Federation | **PASS** | Pool + GitHub OIDC provider restricted to repo ID `1401646031`; verified end-to-end from GitHub Actions |
| Cloud Logging | **PASS** | API enabled, `_Default` (30 d) / `_Required` (400 d) buckets, audit entries readable |
| Cloud Monitoring | **PASS** | API enabled, Monitoring API responds `200`; no dashboards/alerts (Phase 14) |
| Budget alerts | **MANUAL ACTION REQUIRED** | Requires an open billing account |
| Cloud Run readiness | **PASS** (code) | 6 issues fixed + production auth hardening; runtime config listed in [foundation.md §9](foundation.md#9-cloud-run-readiness-review) |
| Terraform | **DEFERRED** (Phase 13) | Strategy in [foundation.md §10](foundation.md#10-terraform-strategy) |

## Documents

| File | Contents |
| --- | --- |
| [foundation.md](foundation.md) | Project, region, environments, APIs, Artifact Registry, naming & labels, logging, monitoring, cost control, Cloud Run readiness, Terraform strategy |
| [iam.md](iam.md) | Identities, least-privilege role plan, Workload Identity Federation design and GitHub restriction |
| [security.md](security.md) | Secret Manager strategy, credential policy, repository credential scan |
| [validation.md](validation.md) | Commands run and their actual results |

## Working with the project locally

ShopCloud uses a **dedicated gcloud configuration** so it never collides with other projects on the machine:

```bash
gcloud config configurations activate shopcloud   # account chaudaki08@gmail.com, project project-c3f386b1-6c37-468d-8ee
gcloud config configurations activate default     # switch back to other work
```

## Out of scope for Phase 6

No Cloud Run, Cloud SQL, application buckets, Pub/Sub, GKE, Terraform resources, deployment pipeline, or
production secrets were created. Those belong to Phases 7–17.
