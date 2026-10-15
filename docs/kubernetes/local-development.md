# ShopCloud Local Kubernetes Development & Validation Guide

## 1. Local Environment Audit & Status

### Audit Results on Development Host
An inspection of the local development environment (`Windows NT`) was conducted during Phase 17:

| Tool | Status | Findings / Evidence | Action / Impact |
|---|---|---|---|
| `docker` | ❌ **NOT INSTALLED** | `The term 'docker' is not recognized` | Container building on this machine is unavailable; delegated to GitHub Actions CI. |
| `kubectl` | ❌ **NOT INSTALLED** | `Get-Command kubectl` returned null | Live cluster CLI unavailable locally; dry-run executed via CI. |
| `kind` / `minikube` | ❌ **NOT INSTALLED** | `Get-Command kind, minikube` returned null | Local cluster spin-up marked as **BLOCKED / NOT RUN**. |
| `kustomize` | ❌ **NOT INSTALLED** | `Get-Command kustomize` returned null | Validated via `scripts/validate-k8s-manifests.js` and CI runner. |
| `js-yaml` / Node.js | ✅ **AVAILABLE** | Node.js 22 LTS with `js-yaml` present | Full static schema, PSS, probe, and secret linting executed locally. |

> [!IMPORTANT]
> In accordance with the project's non-negotiable honesty policy (Rules 5, 11, 12, and 16), live local cluster testing was **NOT RUN** on this host due to the absence of Docker and cluster management utilities. Live deployment, Kustomize rendering, and dry-run validation are executed in GitHub Actions CI where Docker and `kubectl` are available.

---

## 2. Step-by-Step Local Deployment Workflow

For developers running on a workstation with Docker Desktop, Minikube, or Kind installed, follow these steps to run ShopCloud locally:

### Step 1: Start a Local Cluster (Kind or Minikube)
```bash
# Using Kind:
kind create cluster --name shopcloud-local

# Or using Minikube:
minikube start --cpus=4 --memory=6144
```

### Step 2: Build Application Images Locally
```bash
# Build API Gateway
docker build -t shopcloud-api:local -f Dockerfile.api .

# Build Web Frontend
docker build -t shopcloud-web:local -f Dockerfile.web .

# Build Workers Daemon
docker build -t shopcloud-worker:local -f Dockerfile.worker .
```

### Step 3: Load Images into Cluster
```bash
# If using Kind:
kind load docker-image shopcloud-api:local --name shopcloud-local
kind load docker-image shopcloud-web:local --name shopcloud-local
kind load docker-image shopcloud-worker:local --name shopcloud-local
```

### Step 4: Apply Local Overlay
```bash
kubectl apply -k infra/kubernetes/overlays/local
```

### Step 5: Verify Pod Status
```bash
kubectl get pods -n shopcloud -w
```
Wait for all pods to report `Running` and `Ready` status:
```text
NAME                                         READY   STATUS    RESTARTS   AGE
local-shopcloud-api-xxxxxxxx-xxxxx           1/1     Running   0          45s
local-shopcloud-web-xxxxxxxx-xxxxx           1/1     Running   0          40s
local-shopcloud-inventory-worker-xxxx-xxxx   1/1     Running   0          38s
local-shopcloud-notification-worker-xxxx-xxx 1/1     Running   0          38s
```

### Step 6: Port-Forward & Smoke Test
```bash
# Port forward Web Frontend (Port 8080)
kubectl port-forward svc/local-shopcloud-web -n shopcloud 8080:80

# Port forward API Gateway (Port 3000)
kubectl port-forward svc/local-shopcloud-api -n shopcloud 3000:3000
```
Execute smoke check in another terminal:
```bash
curl -fsS http://localhost:8080/health
curl -fsS http://localhost:3000/api/v1/health/liveness
curl -fsS http://localhost:3000/api/v1/catalog/products
```

### Step 7: Clean Up
```bash
kubectl delete -k infra/kubernetes/overlays/local
# Or delete Kind cluster:
kind delete cluster --name shopcloud-local
```
