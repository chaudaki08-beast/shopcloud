# Deployment Strategy, Health Probes & Rollback Runbook

## 1. Cloud Run Deployment Strategy

ShopCloud uses Google Cloud Run for hosting serverless container workloads (`shopcloud-api` and `shopcloud-web`). Cloud Run provides atomic revision deployments, container-level traffic splitting, and instant rollbacks.

### Deployment Process
1. **Immutable Image Pinned by Git SHA**:
   Every deployment uses an immutable image tag:
   `asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/<service>:${GITHUB_SHA}`
2. **Atomic Revision Creation**:
   Cloud Run provisions a new revision (e.g. `shopcloud-api-00015-xyz`).
3. **Traffic Migration**:
   Upon container startup and probe verification, Cloud Run routes 100% of incoming production traffic to the new revision.
4. **Preserved Configuration**:
   Runtime service accounts, Secret Manager bindings, and environment variables are preserved from prior revisions.

---

## 2. Health Probes & Cold Start Handling

### Cloud Run Contract
Cloud Run injects the dynamic port as an environment variable `PORT` (defaults to 8080 in production). Containers must listen on `0.0.0.0:${PORT}` and establish HTTP readiness promptly.

| Service | Probe Endpoint | Behavior & Dependencies |
| :--- | :--- | :--- |
| `shopcloud-api` | `/api/v1/health/liveness` | **Zero External Dependencies**: Returns `{"status":"UP"}` without querying PostgreSQL. Ensures the API container boots and establishes liveness even when Cloud SQL is stopped for cost control. |
| `shopcloud-api` | `/api/v1/health/readiness` | **Full Dependency Check**: Checks Cloud SQL PostgreSQL connectivity. Returns 200 when database is online; 503 when stopped. |
| `shopcloud-web` | `/health` | **Static Web Server Probe**: Returns `{"status":"UP","service":"shopcloud-web"}` directly from Nginx. |
| `shopcloud-workers` | `/health` | **Worker Probe**: Listens on `HEALTH_PORT=8081` (or `$PORT`) to report worker process health. |

---

## 3. Automated Post-Deployment Verification

The CD pipeline (`.github/workflows/deploy.yml`) runs automated smoke probes immediately after updating Cloud Run services:

```bash
# Probing API liveness
curl -fsS --retry 15 --retry-delay 3 --max-time 15 "${API_URL}/api/v1/health/liveness"

# Probing Web storefront health
curl -fsS --retry 15 --retry-delay 2 --max-time 15 "${WEB_URL}/health"
```

If either endpoint fails to respond with HTTP 200 within the allotted retries, the deployment job fails immediately and surfaces alert details in the job summary.

---

## 4. Rollback Runbook

Because Cloud Run revisions are immutable, rolling back to an earlier revision does not require rebuilding or redeploying code. Traffic can be instantly re-routed via traffic management commands.

### Immediate Rollback Commands

To revert traffic back to a known stable revision:

#### 1. List Available Revisions
```bash
gcloud run revisions list --service=shopcloud-api --region=asia-south1
gcloud run revisions list --service=shopcloud-web --region=asia-south1
```

#### 2. Route 100% Traffic to Previous Revision
```bash
# Revert API service to target revision
gcloud run services update-traffic shopcloud-api \
  --to-revisions=<PREVIOUS_STABLE_REVISION>=100 \
  --region=asia-south1

# Revert Web service to target revision
gcloud run services update-traffic shopcloud-web \
  --to-revisions=<PREVIOUS_STABLE_REVISION>=100 \
  --region=asia-south1
```

#### Rollback Guarantees
- **Execution Time**: Under 5 seconds.
- **Downtime**: 0 seconds (active connections drain gracefully; new requests immediately route to the target revision).
- **Cost**: ₹0 / $0.
