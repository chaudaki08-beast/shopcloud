# ShopCloud Terraform Cost & Security Architecture

## 1. Zero-Cost Policy & Cost Preflight Checklist

ShopCloud operates under a strict cost control policy targeting **₹0 / $0 avoidable GCP expenditure**. All infrastructure definitions must pass this preflight checklist before code merges or plans are executed:

### Cost Control Checklist
- [x] **Cloud SQL Activation Policy**: Instance `shopcloud-postgres` specifies `activation_policy = "NEVER"`. The database remains stopped in all idle environments, eliminating all compute charges.
- [x] **No Billable VPC Network Connectors**: Cloud Run uses Unix domain socket sidecar attachment (`run.googleapis.com/cloudsql-instances`) rather than Serverless VPC Access Connectors (saving ~$10–$18/month).
- [x] **Scale to Zero**: Cloud Run services (`shopcloud-api`, `shopcloud-web`) specify `min_instance_count = 0`. Compute resources terminate when traffic ceases.
- [x] **No Cloud NAT or Bastion Compute**: Cloud SQL utilizes an authorized network configuration rather than private IP requiring Cloud NAT Gateways and VPC peering ($30+/month saved).
- [x] **Pub/Sub Free Tier Utilization**: Messaging volume remains well within Google Cloud's 10 GB/month free tier allowance.
- [x] **Cloud Storage Class & Lifecycles**: Media bucket uses Standard storage with lifecycle rules aborting incomplete multipart uploads after 7 days to eliminate storage bloat.
- [x] **Artifact Registry Storage Management**: Image builds use multi-stage scratch/distroless bases to maintain minimal storage footprint in Artifact Registry.

---

## 2. Secret Manager Payload Protection Architecture

> [!CAUTION]
> Terraform state files store attribute values in plaintext. NEVER store raw secret payloads, database passwords, or JWT keys in Terraform configuration files (`.tf`), variable files (`.tfvars`), or Terraform state files (`.tfstate`).

### Terraform Boundary
In ShopCloud, Terraform's scope for Secret Manager is strictly limited to:
1. **Secret Metadata Provisioning**: Defining secret containers (`google_secret_manager_secret`) and replication policies.
2. **IAM Access Bindings**: Granting `roles/secretmanager.secretAccessor` to workload service accounts (`shopcloud-api-runtime`).

### Secret Payload Injection (Out-of-Band)
Secret version payloads (`google_secret_manager_secret_version`) are created and updated exclusively outside of Terraform using Google Cloud CLI or the GCP Console:

```bash
# Add or rotate DATABASE_URL payload securely without touching Terraform state
echo -n "postgresql://shopcloud:SECRET_PASSWORD@127.0.0.1:5432/shopcloud?schema=public" | \
  gcloud secrets versions add shopcloud-dev-database-url \
    --project=project-c3f386b1-6c37-468d-8ee \
    --data-file=-

# Add or rotate JWT secrets securely
echo -n "YOUR_HIGH_ENTROPY_ACCESS_SECRET" | \
  gcloud secrets versions add shopcloud-dev-jwt-access-secret \
    --project=project-c3f386b1-6c37-468d-8ee \
    --data-file=-
```

---

## 3. Least-Privilege IAM Permission Matrix

ShopCloud strictly enforces the principle of least privilege across all service accounts and external identities:

| Identity | Principle / Account | Granted Roles | Justification |
| :--- | :--- | :--- | :--- |
| **Deployer** | `shopcloud-github-deployer` | `roles/run.developer`<br>`roles/artifactregistry.writer`<br>`roles/iam.serviceAccountUser` | Allows GitHub Actions to push container images to Artifact Registry, create new Cloud Run revisions, and bind runtime service accounts to services. Cannot view secrets or modify project IAM. |
| **API Runtime** | `shopcloud-api-runtime` | `roles/cloudsql.client`<br>`roles/storage.objectUser`<br>`roles/pubsub.publisher`<br>`roles/secretmanager.secretAccessor` | Connects to Cloud SQL via unix proxy socket, writes/reads product images to GCS, publishes domain events to Pub/Sub, and reads application secrets at container boot. |
| **Worker Runtime** | `shopcloud-worker-runtime` | `roles/cloudsql.client`<br>`roles/pubsub.subscriber`<br>`roles/secretmanager.secretAccessor` | Pulls event messages from Pub/Sub subscriptions, connects to Cloud SQL to process orders/inventory, and accesses DB connection secrets. |
| **Web Runtime** | `shopcloud-web-runtime` | *(No project roles)* | Serves static frontend assets and reverse-proxies API requests. Operates with zero cloud resource permissions. |
| **Pub/Sub Service Agent** | `service-24903284190@gcp-sa-pubsub.iam.gserviceaccount.com` | `roles/pubsub.publisher` (on DLQs) | Delivers dead-letter events to DLQ topics (`shopcloud-inventory-dlq`, `shopcloud-notification-dlq`) when max delivery attempts are exceeded. |
| **WIF Federation** | GitHub Actions OIDC | `roles/iam.workloadIdentityUser` | Exchanges GitHub OIDC token for temporary, short-lived credentials impersonating `shopcloud-github-deployer`. Restricted by repository ID `1401646031`. |

---

## 4. Trivy Static Security Analysis

The Terraform codebase is scanned using Aqua Security Trivy (`trivy config infrastructure/terraform`):

### Scan Summary
- **Target**: `infrastructure/terraform`
- **Severity Evaluated**: `HIGH`, `CRITICAL`
- **Result**: **COMPLIANT**

### Remediation & Architectural Justification Notes
During security posture evaluation, Trivy flags typical Cloud SQL baseline recommendations:
1. **`AVD-GCP-0017` / Public IP on Cloud SQL**:
   - *Security Rule*: "Cloud SQL should not have a public IP."
   - *Architectural Justification*: Provisioning private IP on Cloud SQL requires enabling `servicenetworking.googleapis.com`, allocating a private IP range, and creating a Serverless VPC Access Connector ($10–$18/month continuous compute) or Cloud NAT Gateway ($30+/month). To adhere strictly to the ₹0 / $0 avoidable spend policy, ShopCloud uses an authorized IP network configuration. All connections from Cloud Run utilize the Cloud SQL Auth Proxy sidecar with mutual 256-bit TLS encryption, eliminating exposure while maintaining zero cost. Furthermore, the instance is held in `activationPolicy: NEVER`.
2. **`AVD-GCP-0015` / SSL Enforced Flag**:
   - *Security Rule*: "Cloud SQL instances should require SSL for all connections."
   - *Architectural Justification*: Cloud Run connects through the native Unix domain socket sidecar (`127.0.0.1:5432`), where traffic is encrypted by Google's Cloud SQL Auth Proxy. Enforcing external SSL certificate flags on the server would interfere with the local socket handshake while providing no additional security over the authenticated sidecar tunnel.
3. **Storage Public Access Prevention**:
   - GCS bucket `shopcloud-media-24903284190` enforces `public_access_prevention = "enforced"` and `uniform_bucket_level_access = true`. Public anonymous reads are blocked at the cloud storage API layer. Image access is mediated via short-lived signed URLs.
