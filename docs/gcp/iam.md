# IAM & Workload Identity Federation

## 1. Principles

- **No Owner/Editor for workloads.** Only the human owner (`user:chaudaki08@gmail.com`) holds `roles/owner`.
- **One identity per workload.** API, worker and CI/CD never share a service account.
- **Grant on the resource, not the project.** Roles are bound to the specific secret, bucket, topic or repository
  a workload needs, in the phase that creates that resource.
- **No service-account JSON keys.** CI/CD authenticates through Workload Identity Federation. The organization
  policy `iam.disableServiceAccountKeyCreation` is **enforced** on this project, so user-managed keys cannot be
  created at all (verified with `gcloud resource-manager org-policies describe --effective`).

## 2. Service accounts

| Service account | Purpose | Roles today | User-managed keys |
| --- | --- | --- | --- |
| `shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Cloud Run API runtime — serving `shopcloud-api` | none at project level; `secretAccessor` on `shopcloud-dev-jwt-access-secret`, `shopcloud-dev-jwt-refresh-secret`, `shopcloud-dev-database-url` | 0 |
| `shopcloud-web-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` (Phase 7) | Cloud Run web (nginx) runtime — serving `shopcloud-web` | **none** | 0 |
| `shopcloud-worker-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Cloud Run worker runtime (Phase 10) | none at project level; `secretAccessor` on `shopcloud-dev-database-url` | 0 |
| `shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | GitHub Actions deployment identity | none at project level; `artifactregistry.writer` on repository `shopcloud`; impersonable only via WIF (below) | 0 |

`24903284190-compute@developer.gserviceaccount.com` (Compute Engine default) was created automatically when Cloud Run was
enabled in Phase 7. The org policy `iam.automaticIamGrantsForDefaultServiceAccounts` is enforced, so it has **no roles**,
and no ShopCloud service runs as it.

Each account has exactly one Google-managed `SYSTEM_MANAGED` key (created automatically by GCP, not downloadable).

Project-level IAM policy after Phase 6 — no ShopCloud identity holds a project-level role:

```
roles/owner                          user:chaudaki08@gmail.com
roles/artifactregistry.serviceAgent  serviceAccount:service-24903284190@gcp-sa-artifactregistry.iam.gserviceaccount.com   # Google-managed, added when the API was enabled
```

## 3. Least-privilege grants by phase

| Phase | Identity | Role | Scope |
| --- | --- | --- | --- |
| 6 ✅ | api-runtime | `roles/secretmanager.secretAccessor` | `shopcloud-dev-jwt-access-secret`, `shopcloud-dev-jwt-refresh-secret`, `shopcloud-dev-database-url` |
| 6 ✅ | worker-runtime | `roles/secretmanager.secretAccessor` | `shopcloud-dev-database-url` |
| 6 ✅ | github-deployer | `roles/artifactregistry.writer` | repository `shopcloud` only |
| 7 ✅ | `allUsers` | `roles/run.invoker` | `shopcloud-api`, `shopcloud-web` (public endpoints; the app enforces auth) |
| 7 ✅ | web-runtime (new) | **none** | serves static files and proxies over public HTTPS |
| 7 — not needed | api-runtime, web-runtime | ~~`logging.logWriter`, `monitoring.metricWriter`, `cloudtrace.agent`~~ | Cloud Run ships stdout/stderr and request logs through the platform (verified). Grant in Phase 14 only if the app calls these APIs directly |
| 12 | github-deployer | `roles/run.developer` | the ShopCloud Cloud Run services |
| 12 | github-deployer | `roles/iam.serviceAccountUser` | **on** api-runtime and web-runtime only (to deploy as them) |
| 8 | api-runtime, worker-runtime | `roles/cloudsql.client` (+ `roles/cloudsql.instanceUser` if IAM DB auth) | project / instance |
| 9 | api-runtime | `roles/storage.objectAdmin` | media bucket only |
| 10 | api-runtime | `roles/pubsub.publisher` | each topic it publishes to |
| 10 | worker-runtime | `roles/pubsub.subscriber` | each subscription it consumes |
| 10 | Pub/Sub service agent | `roles/run.invoker` | worker service (push subscriptions) |

Dedicated Cloud SQL / Storage / Pub/Sub identities are **not** created separately: access is attached to the
workload identity that actually performs the call, which keeps the number of principals small and auditable.
A separate migration-job identity (`shopcloud-migrator`) is planned for Phase 8 so the API runtime never holds
DDL rights.

## 4. Workload Identity Federation

```
GitHub Actions job (chaudaki08-beast/shopcloud, permissions: id-token: write)
        │  GitHub OIDC token (iss=https://token.actions.githubusercontent.com)
        ▼
WIF provider  projects/24903284190/locations/global/workloadIdentityPools/shopcloud-github-pool/providers/github-actions
        │  attribute condition: repository_id == 1401646031 && repository_owner_id == 292493253
        │  STS exchange → federated token
        ▼
shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com
        │  roles/iam.workloadIdentityUser granted ONLY to
        │  principalSet://iam.googleapis.com/projects/24903284190/locations/global/workloadIdentityPools/shopcloud-github-pool/attribute.repository_id/1401646031
        ▼
Short-lived OAuth access token (no long-lived key anywhere)
```

| Item | Value |
| --- | --- |
| Pool | `shopcloud-github-pool` (global, ACTIVE) |
| Provider | `github-actions` (OIDC, ACTIVE) |
| Issuer | `https://token.actions.githubusercontent.com` |
| Attribute mapping | `google.subject=assertion.sub`, `attribute.repository`, `attribute.repository_id`, `attribute.repository_owner_id`, `attribute.ref`, `attribute.actor` |
| Attribute condition | `assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'` |
| Impersonation binding | `roles/iam.workloadIdentityUser` on the deployer SA for `attribute.repository_id/1401646031` |

**Why numeric IDs instead of the repository name:** if `chaudaki08-beast/shopcloud` were ever renamed or deleted,
someone could create a new repository with the old name. The numeric `repository_id` / `repository_owner_id`
cannot be reused, so only this exact repository can obtain tokens. Tokens from any other repository are rejected
at the STS exchange by the provider condition, before any service-account binding is evaluated.

**Validation: PASS.** The read-only workflow `.github/workflows/gcp-wif-check.yml` authenticated through the provider,
impersonated the deployer, and confirmed the token identity with Google's `tokeninfo` endpoint
(`Token issued for: shopcloud-github-deployer@…`), run `37189323203`. It also proves least privilege on every run
(run `37192436373`): reading repository `shopcloud` → **200**, reading secret `shopcloud-dev-jwt-access-secret` → **403**,
reading the project IAM policy → **403**. The audit log shows the matching
`GenerateAccessToken` call. A negative test from a different repository was not executed; rejection relies on the
provider condition above.

**Phase 12 hardening (DEFERRED):** today any workflow in this repository (any branch) can impersonate the deployer —
acceptable while its only permission is pushing images to its own registry. Before granting deploy roles, restrict the binding to
`attribute.ref/refs/heads/main` (or a GitHub Environment with required reviewers) so feature branches cannot deploy.

## 5. Values for the CD workflow (Phase 12)

`deploy.yml` reads three repository secrets. They are **intentionally not set yet**: setting them would make the CD
preflight report "configured" and attempt a deployment that cannot succeed (no Cloud Run services until Phase 7).

| Secret | Value to set in Phase 12 (identifiers, not credentials) |
| --- | --- |
| `GCP_PROJECT_ID` | `project-c3f386b1-6c37-468d-8ee` |
| `GCP_WIF_PROVIDER` | `projects/24903284190/locations/global/workloadIdentityPools/shopcloud-github-pool/providers/github-actions` |
| `GCP_WIF_SERVICE_ACCOUNT` | `shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` |
