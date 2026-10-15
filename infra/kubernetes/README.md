# ShopCloud Kubernetes Manifests & Architecture

## 1. Directory Structure

```text
infra/kubernetes/
├── base/
│   ├── namespace.yaml                     # Namespace 'shopcloud' with PSS Restricted enforcement
│   ├── configmap.yaml                     # Application runtime configuration
│   ├── secret.yaml                        # Non-sensitive schema template (0 committed plaintext secrets)
│   ├── api-deployment.yaml                # ShopCloud NestJS API Gateway (Non-root, probes, resource bounds)
│   ├── api-service.yaml                   # ClusterIP Service (Port 3000)
│   ├── web-deployment.yaml                # ShopCloud React+Nginx Storefront (Probes, resource bounds)
│   ├── web-service.yaml                   # ClusterIP Service (Port 80)
│   ├── inventory-worker-deployment.yaml   # Event-driven inventory consumer daemon (Pull mode)
│   ├── notification-worker-deployment.yaml# Event-driven notification consumer daemon (Pull mode)
│   ├── ingress.yaml                       # Ingress routing /api to API and / to Web
│   ├── hpa-api.yaml                       # HPA for API (Min: 2, Max: 5, Target CPU: 70%)
│   ├── hpa-web.yaml                       # HPA for Web (Min: 2, Max: 4, Target CPU: 75%)
│   ├── pdb-api.yaml                       # PodDisruptionBudget for API (minAvailable: 1)
│   ├── pdb-web.yaml                       # PodDisruptionBudget for Web (minAvailable: 1)
│   ├── resource-quota.yaml                # Namespace hard resource quotas (Max 4 CPU, 4Gi RAM requests)
│   ├── limit-range.yaml                   # Default container limits and request floors
│   └── kustomization.yaml                 # Base Kustomize composition
├── overlays/
│   ├── local/
│   │   └── kustomization.yaml             # Minimal single-replica local dev overlay with mock configs
│   └── staging/
│       ├── kustomization.yaml             # GKE staging overlay with Artifact Registry image tags
│       ├── service-accounts.yaml          # GKE Workload Identity Kubernetes ServiceAccounts
│       ├── cloud-sql-proxy-patch.yaml     # Cloud SQL Auth Proxy v2 sidecar for private DB access
│       └── worker-sa-patch.yaml           # Workload Identity binding patch for workers
└── README.md
```

---

## 2. Workload Specifications & Readiness Matrix

| Workload | Component | Base Replicas | CPU Req/Lim | Memory Req/Lim | Liveness / Readiness Probes | Security Profile |
|---|---|---|---|---|---|---|
| `shopcloud-api` | Backend API | 2 (HPA: 2-5) | `100m` / `500m` | `128Mi` / `384Mi` | `/api/v1/health/liveness`, `/readiness` (Port 3000) | **Restricted** (UID 1000, read-only root, drop ALL) |
| `shopcloud-web` | Frontend Web | 2 (HPA: 2-4) | `50m` / `200m` | `32Mi` / `64Mi` | `/health` (Port 8080) | **Restricted** (Drop ALL capabilities, non-privileged) |
| `shopcloud-inventory-worker` | Inventory Worker | 1 (Pull mode) | `50m` / `300m` | `64Mi` / `256Mi` | `/health` (Port 8081) | **Restricted** (UID 1000, read-only root, drop ALL) |
| `shopcloud-notification-worker` | Notification Worker | 1 (Pull mode) | `50m` / `300m` | `64Mi` / `256Mi` | `/health` (Port 8081) | **Restricted** (UID 1000, read-only root, drop ALL) |

---

## 3. Pod Security Standards (PSS) Compliance

Every manifest strictly adheres to Kubernetes **Pod Security Standards (Restricted profile)**:
1. `runAsNonRoot: true` with explicit non-root UID/GID (`1000:1000` for API and Workers; `65532:65532` for Cloud SQL Proxy).
2. `allowPrivilegeEscalation: false` enforced on all containers.
3. `capabilities: drop: ["ALL"]` stripping all Linux capabilities.
4. `seccompProfile: type: RuntimeDefault` applied to all pod specs.
5. `readOnlyRootFilesystem: true` enabled wherever compatible, using ephemeral `emptyDir` volumes for `/tmp` and cache directories.
6. Zero host networking, zero host PID/IPC sharing, and zero `hostPath` mounts.

---

## 4. Usage & Kustomize Commands

### Build Manifests
```bash
# Render Base
kubectl kustomize infra/kubernetes/base

# Render Local Development Overlay
kubectl kustomize infra/kubernetes/overlays/local

# Render GKE Staging Overlay
kubectl kustomize infra/kubernetes/overlays/staging
```

### Apply Locally (Dry-Run / Client Validation)
```bash
kubectl apply --dry-run=client -k infra/kubernetes/overlays/local
```

### Static Schema & Security Linting
```bash
node scripts/validate-k8s-manifests.js
```
