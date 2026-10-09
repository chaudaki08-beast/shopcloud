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
| Cloud Run (Phase 7) | **PASS** | `shopcloud-api` + `shopcloud-web` live; database-backed features live in Phase 8 |
| Cloud SQL (Phase 8) | **PASS** | `shopcloud-postgres` active (stopped for cost control); migrations applied |
| Cloud Storage (Phase 9) | **PASS** | `gs://shopcloud-media-24903284190` active; product image pipelines verified |
| Pub/Sub & Workers (Phase 10) | **PASS** | Topics, subscriptions, dead-letter queues, outbox pattern & workers active |
| Terraform | **DEFERRED** (Phase 13) | Strategy in [foundation.md §10](foundation.md#10-terraform-strategy) |

## Documents

| File | Contents |
| --- | --- |
| [foundation.md](foundation.md) | Project, region, environments, APIs, Artifact Registry, naming & labels, logging, monitoring, cost control, Cloud Run readiness, Terraform strategy |
| [iam.md](iam.md) | Identities, least-privilege role plan, Workload Identity Federation design and GitHub restriction |
| [security.md](security.md) | Secret Manager strategy, credential policy, repository credential scan |
| [cloud-run.md](cloud-run.md) | Phase 7: services, URLs, images, IAM, secrets, probes, scaling, rollback, limitations |
| [cloud-sql.md](cloud-sql.md) | Phase 8: Cloud SQL PostgreSQL 16 architecture, specs, connection pooling, backups |
| [database-production.md](database-production.md) | Phase 8: Production migrations, seeding strategy, operational playbooks |
| [cloud-storage.md](cloud-storage.md) | Phase 9: Google Cloud Storage bucket architecture, media endpoints, streaming |
| [storage-security.md](storage-security.md) | Phase 9: Object storage security, magic bytes validation, least-privilege IAM |
| [pubsub.md](pubsub.md) | Phase 10: Google Cloud Pub/Sub topics, subscriptions, ordering keys, DLQ policies |
| [event-driven-architecture.md](event-driven-architecture.md) | Phase 10: Transactional Outbox pattern, event taxonomy, CloudEvents v1.0, durable idempotency |
| [workers.md](workers.md) | Phase 10: Background workers (`InventoryWorker`, `NotificationWorker`), pull/push delivery |
| [validation.md](validation.md) | Commands run and their actual results (Phases 6, 7, 8, 9, 10) |

## Working with the project locally

ShopCloud uses a **dedicated gcloud configuration** so it never collides with other projects on the machine:

```bash
gcloud config configurations activate shopcloud   # account chaudaki08@gmail.com, project project-c3f386b1-6c37-468d-8ee
gcloud config configurations activate default     # switch back to other work
```

## Live endpoints & Resources (Phase 10)

- Web: https://shopcloud-web-24903284190.asia-south1.run.app
- API: https://shopcloud-api-24903284190.asia-south1.run.app
- Storage Bucket: `gs://shopcloud-media-24903284190` (`asia-south1`)
- Pub/Sub Topics: `shopcloud-domain-events`, `shopcloud-inventory-dlq`, `shopcloud-notification-dlq`
- Pub/Sub Subscriptions: `shopcloud-inventory-sub`, `shopcloud-notification-sub`, `shopcloud-inventory-dlq-sub`, `shopcloud-notification-dlq-sub`
- Cloud SQL Instance: `shopcloud-postgres` (PostgreSQL 16, stopped for cost control)

Next phase: Payment Processing & Webhooks (Phase 11).
