# ShopCloud Kubernetes Security Architecture & Hardening Guide

## 1. Threat Model & Security Posture

ShopCloud implements defense-in-depth across the Kubernetes compute layer, adhering to the principle of least privilege, zero trust, and immutable infrastructure. The security model is designed to prevent privilege escalation, lateral network movement, and secret exposure.

---

## 2. Pod Security Standards (PSS) — Restricted Profile

The `shopcloud` namespace enforces the Kubernetes **Restricted** Pod Security Standard at the admission level:

```yaml
metadata:
  name: shopcloud
  labels:
    pod-security.kubernetes.io/enforce: restricted
    pod-security.kubernetes.io/enforce-version: latest
    pod-security.kubernetes.io/audit: restricted
    pod-security.kubernetes.io/warn: restricted
```

### 2.1 Enforced Security Controls

| Control | Implementation | Purpose |
|---|---|---|
| **Non-Root Execution** | `runAsNonRoot: true`, `runAsUser: 1000` | Ensures processes cannot run as root (UID 0), preventing container breakout attacks. |
| **Privilege Escalation** | `allowPrivilegeEscalation: false` | Disallows gaining more privileges than the parent process (blocks setuid/setgid binaries). |
| **Linux Capabilities** | `capabilities: drop: ["ALL"]` | Strips all Linux kernel capabilities from the container. |
| **Seccomp Profile** | `seccompProfile: type: RuntimeDefault` | Blocks unauthorized system calls at the kernel syscall filter layer. |
| **Read-Only Root Filesystem** | `readOnlyRootFilesystem: true` | Prevents runtime malware execution, trojan persistence, or malicious dependency injection. |
| **No Host Sharing** | `hostNetwork: false`, `hostPID: false`, `hostIPC: false` | Prevents accessing host namespace networking, processes, or inter-process communications. |
| **No Host Paths** | Zero `hostPath` volumes | Prohibits mounting host directories into containers. |

---

## 3. Workload Identity Federation for GKE

### 3.1 Architecture
In GKE, Google Cloud Service Account (GSA) keys (JSON files) are strictly prohibited. Workload Identity binds Kubernetes Service Accounts (KSA) directly to IAM GSAs using OIDC token exchange:

```
┌─────────────────────────────────┐           ┌───────────────────────────────────┐
│ Kubernetes Service Account      │           │ Google Cloud IAM Service Account  │
│ (shopcloud/shopcloud-api-ksa)   │◄─────────►│ (shopcloud-api@project.iam.gsa)   │
└─────────────────────────────────┘  OIDC Fed └───────────────────────────────────┘
```

### 3.2 IAM Role Bindings
The GSA binding requires the `roles/iam.workloadIdentityUser` role:
```bash
gcloud iam service-accounts add-iam-policy-binding \
  shopcloud-api@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com \
  --role="roles/iam.workloadIdentityUser" \
  --member="serviceAccount:project-c3f386b1-6c37-468d-8ee.svc.id.goog[shopcloud/shopcloud-api-ksa]"
```

### 3.3 Least-Privilege Role Separation
- **`shopcloud-api`**: Scoped exclusively to:
  - `roles/cloudsql.client` (Connect via Cloud SQL Auth Proxy).
  - `roles/pubsub.publisher` (Publish outbox events to `shopcloud-order-events`).
  - `roles/storage.objectAdmin` (Generate signed URLs for product images).
- **`shopcloud-worker`**: Scoped exclusively to:
  - `roles/pubsub.subscriber` (Pull from `shopcloud-inventory-sub` and `shopcloud-notification-sub`).
  - `roles/cloudsql.client` (Write inventory movements and state changes).

---

## 4. Secret Management Strategy

### 4.1 Production Secrets Isolation
- No database passwords, webhook secrets, JWT private keys, or API tokens are stored in git or raw Kubernetes Secret YAMLs.
- Secrets are sourced dynamically from **Google Cloud Secret Manager**.

### 4.2 Integration Approaches on GKE

#### Approach A: Secrets Store CSI Driver (Recommended for GKE Standard / Autopilot)
Mounts Secret Manager secrets as ephemeral in-memory volumes into the pod:
```yaml
apiVersion: secrets-store.csi.x-k8s.io/v1
kind: SecretProviderClass
metadata:
  name: shopcloud-gcp-secrets
  namespace: shopcloud
spec:
  provider: gcp
  parameters:
    secrets: |
      - resourceName: "projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-db-password/versions/latest"
        fileName: "db-password"
```

#### Approach B: Direct Secret Manager API Lookup via WIF
Applications call the Google Secret Manager SDK directly on startup using ambient Workload Identity credentials, eliminating secret files from pod filesystems entirely.
