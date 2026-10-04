# Security Baseline

## 1. Secret Manager strategy

**Status: PASS** — `secretmanager.googleapis.com` is enabled. Three secret **containers** exist with labels,
`asia-south1` user-managed replication and per-secret IAM. Phase 6 created them without values; in Phase 7 the JWT access
secret received a random value generated straight into Secret Manager (never displayed, never in this repository) and is
mounted by Cloud Run pinned to version 2. The database URL arrives in Phase 8.

| Secret (created) | Versions | Accessors |
| --- | --- | --- |
| `shopcloud-dev-jwt-access-secret` | **1 enabled (v2, Phase 7)** | `shopcloud-api-runtime` |
| `shopcloud-dev-jwt-refresh-secret` | 0 — not needed (refresh tokens are opaque random values stored hashed; no code reads it) | `shopcloud-api-runtime` |
| `shopcloud-dev-database-url` | 0 | `shopcloud-api-runtime`, `shopcloud-worker-runtime` |

The deployer has no Secret Manager access (verified: 403 from GitHub Actions).

### Naming

Secret Manager IDs may only contain letters, digits, `-` and `_` (no `/`), so the hierarchical form
`shopcloud/<env>/<name>` is expressed as **`shopcloud-<env>-<name>`**:

| Secret ID | Consumer | Created |
| --- | --- | --- |
| `shopcloud-dev-database-url` | api-runtime, worker-runtime, migrator (Phase 8) | Phase 6 (container only) |
| `shopcloud-dev-jwt-access-secret` | api-runtime | Phase 6 (container only) |
| `shopcloud-dev-jwt-refresh-secret` | api-runtime | Phase 6 (container only) |
| `shopcloud-dev-payment-secret-key` | api-runtime | Phase 11 |
| `shopcloud-dev-payment-webhook-secret` | api-runtime | Phase 11 |

Labels on every secret: `project=shopcloud`, `environment=<env>`, `component=<consumer>`, `owner=shopcloud`.
Replication: user-managed, `asia-south1` only (data residency + region consistency).

### Access model

- Each runtime service account gets `roles/secretmanager.secretAccessor` **on the individual secrets it needs**,
  never at project level. The deployer never reads secret values.
- Cloud Run mounts secrets as environment variables pinned to a version (`--set-secrets=JWT_ACCESS_SECRET=shopcloud-dev-jwt-access-secret:1`)
  so a rotation is an explicit, reviewable deployment.
- Values are created out-of-band by the owner (`gcloud secrets versions add … --data-file=-`), never from files in the repo.
- The application must refuse to start in production when a required secret is missing
  (implemented: the API refuses to boot without `JWT_ACCESS_SECRET` — [foundation.md §9, issue 2](foundation.md#9-cloud-run-readiness-review)).

## 2. Credential policy

| Rule | Enforcement |
| --- | --- |
| No service-account JSON keys | Org policy `iam.disableServiceAccountKeyCreation` **enforced**; CI uses WIF; 0 user-managed keys exist |
| No `.env` in git or images | `.gitignore` (`.env`), `.dockerignore` (`.env`, `.env.*`) |
| No GCP credential files in git or images | Phase 6 added `gha-creds-*.json`, `*-sa-key.json`, `*service-account*.json`, `application_default_credentials.json`, `credentials.json`, `*.pem`, `*.p12` to both ignore files |
| CI-only values are throwaway | `ci.yml` uses clearly labelled `ci-only-*` JWT values for an ephemeral Postgres container |
| WIF identifiers are not secrets | Pool/provider names and SA emails are public resource names; tokens are never printed |
| Seeded dev users | `packages/database/src/seed.ts` uses a documented dev-only password hash ("Password123!") — the seed must never run against staging/prod (Phase 8: migrator job runs migrations only) |

## 3. Repository credential scan (Phase 6)

Scope: every git-tracked file (`git ls-files` / `git grep`), excluding `package-lock.json`.

| Check | Result |
| --- | --- |
| Tracked `.env*` files | only `.env.example`, `.env.docker.example` (templates with placeholder values) |
| Tracked `*.json` credential files, `*.pem`, `*.key`, `*.p12` | none |
| Private key blocks (`BEGIN … PRIVATE KEY`) | none |
| GCP SA key JSON (`"type": "service_account"`, `private_key_id`) | none |
| Google API keys (`AIza…`), GitHub tokens (`ghp_`, `gho_`, `github_pat_`), AWS keys (`AKIA…`), Stripe live keys (`sk_live_`), Slack tokens | none |
| Hardcoded password/secret/token assignments | none outside documented dev/test/example placeholders |
| Tracked files matching the new ignore patterns | 0 |

Reviewed: `.gitignore`, `.dockerignore`, `.github/workflows/*.yml`, `Dockerfile.*`, `compose.yaml`, `docs/`.
**No secret was found; nothing needed to be removed from history.**

Non-secret findings (fixed on `fix/cloud-run-readiness`):

1. Hardcoded JWT fallback `'shopcloud-default-secret-change-me'` — now dev-only; production refuses to boot without `JWT_ACCESS_SECRET`.
2. CORS `origin: '*'` with `credentials: true` — now a `CORS_ORIGIN` allowlist; `*` rejected in production.
3. Hardcoded demo logins, demo JWT subjects, offline token fallbacks and the `x-user-id` header — disabled in production
   (see [foundation.md §9](foundation.md#9-cloud-run-readiness-review)).
4. Rate limiter keyed on the client-controlled left side of `X-Forwarded-For` — now uses `TRUST_PROXY_HOPS`.
