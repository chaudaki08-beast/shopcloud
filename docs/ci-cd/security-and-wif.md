# Security, Least Privilege & Workload Identity Federation

## 1. Zero Static Credentials Architecture

ShopCloud enforces a strict zero-credential policy across the entire continuous integration and deployment lifecycle. No static service account keys (JSON keys), passwords, or permanent cloud tokens are ever created or stored in GitHub Secrets.

### Organization Policy Enforcement
The project enforces Google Cloud Organization Policy:
`iam.disableServiceAccountKeyCreation: true`

This guarantees that:
- Neither developers nor automated scripts can create user-managed service account keys.
- The repository relies entirely on short-lived, cryptographically validated identity federation.

---

## 2. Workload Identity Federation (WIF)

GitHub Actions authenticates to Google Cloud Platform via OpenID Connect (OIDC) token exchange with Google Security Token Service (STS).

### Architecture Diagram

```
 GitHub Actions Runner (chaudaki08-beast/shopcloud)
   │
   │ 1. Request OIDC Token (aud = https://iam.googleapis.com)
   ▼
 GitHub OIDC Provider (token.actions.githubusercontent.com)
   │
   │ 2. Issues Signed JWT Assertion
   ▼
 Google Security Token Service (STS)
   │
   │ 3. Validates Assertion & Evaluates Attribute Condition:
   │    assertion.repository_id == '1401646031' &&
   │    assertion.repository_owner_id == '292493253'
   ▼
 Workload Identity Pool: shopcloud-github-pool
 Workload Identity Provider: github-actions
   │
   │ 4. Exchanges for Federated STS Token
   ▼
 Service Account Impersonation
   │
   │ 5. Roles: roles/iam.workloadIdentityUser
   ▼
 Short-lived OAuth 2.0 Access Token (TTL <= 1200s)
 Principal: shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com
```

### Immutable Numeric Identity Pinning
Rather than matching on the string name `chaudaki08-beast/shopcloud`, the Workload Identity Provider condition explicitly pins the **numeric repository ID** and **numeric owner ID**:

```cel
assertion.repository_id == '1401646031' && assertion.repository_owner_id == '292493253'
```

**Security Benefit**: If the repository or GitHub username were ever renamed or deleted, no newly created repository with the old name can impersonate the GCP deployer account. The numeric ID cannot be reused.

---

## 3. Least-Privilege IAM Matrix

In accordance with Phase 12 architecture, the deployment principal `shopcloud-github-deployer` is granted only the minimum permissions necessary to push container images and update Cloud Run service revisions.

| Role | Target Resource | Purpose |
| :--- | :--- | :--- |
| `roles/artifactregistry.writer` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/repositories/shopcloud` | Publish container images to Artifact Registry. |
| `roles/run.developer` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-api` | Deploy revisions to Cloud Run API service. |
| `roles/run.developer` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-web` | Deploy revisions to Cloud Run Web storefront service. |
| `roles/iam.serviceAccountUser` | `shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Authorize Cloud Run API service to run under runtime SA. |
| `roles/iam.serviceAccountUser` | `shopcloud-web-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Authorize Cloud Run Web service to run under runtime SA. |

### Prohibited Project-Level Roles
- `shopcloud-github-deployer` has **zero** project-level roles (`roles/owner`, `roles/editor`, `roles/viewer` are NOT granted).
- Deployer cannot read Secret Manager secret values (`roles/secretmanager.secretAccessor` is denied).
- Deployer cannot modify IAM policies, create buckets, or alter database instances.

---

## 4. Automated Secret Leakage & Vulnerability Gate

Every pull request and push runs `scripts/ci-security-check.js`:
1. **Tracked Files Audit**: Ensures no `.env`, `.pem`, `.key`, `service-account*.json`, or `credentials.json` files are committed to Git.
2. **Signature Pattern Scan**: Scans source code for private keys (`BEGIN PRIVATE KEY`), service account JSON markers (`"type": "service_account"`), or personal access tokens (`ghp_`, `gho_`).
3. **Dependency Vulnerability Gate**: Executes `npm audit --omit=dev --audit-level=critical` to block critical vulnerabilities in production dependencies.
