# ShopCloud Terraform State Management & Import Guide

## 1. Overview

This document provides the definitive guide for managing Terraform state in ShopCloud, mapping live Google Cloud Platform resources to their declarative Terraform addresses, performing state migrations, and executing step-by-step imports.

---

## 2. Live GCP Resource Address Mapping

Every managed GCP resource in `project-c3f386b1-6c37-468d-8ee` is mapped to an exact Terraform resource address:

| Domain | Terraform Address | GCP Resource ID / URI | Notes |
| :--- | :--- | :--- | :--- |
| **IAM** | `module.iam.google_service_account.api_runtime` | `projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | API runtime identity |
| **IAM** | `module.iam.google_service_account.web_runtime` | `projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-web-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Web storefront identity |
| **IAM** | `module.iam.google_service_account.worker_runtime` | `projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-worker-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | Async background workers |
| **IAM** | `module.iam.google_service_account.github_deployer` | `projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com` | CI/CD deployment identity |
| **IAM** | `module.iam.google_iam_workload_identity_pool.github_pool` | `projects/project-c3f386b1-6c37-468d-8ee/locations/global/workloadIdentityPools/shopcloud-github-pool` | WIF Pool |
| **IAM** | `module.iam.google_iam_workload_identity_pool_provider.github_provider` | `projects/project-c3f386b1-6c37-468d-8ee/locations/global/workloadIdentityPools/shopcloud-github-pool/providers/github-actions` | WIF OIDC Provider |
| **Registry** | `module.artifact_registry.google_artifact_registry_repository.docker_repo` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/repositories/shopcloud` | Docker container registry |
| **Storage** | `module.storage.google_storage_bucket.media_bucket` | `shopcloud-media-24903284190` | Durable media storage |
| **Secret Manager** | `module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-database-url"]` | `projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-database-url` | Metadata only |
| **Secret Manager** | `module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-jwt-access-secret"]` | `projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-jwt-access-secret` | Metadata only |
| **Secret Manager** | `module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-jwt-refresh-secret"]` | `projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-jwt-refresh-secret` | Metadata only |
| **Pub/Sub** | `module.pubsub.google_pubsub_topic.domain_events` | `projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-domain-events` | Domain event stream |
| **Pub/Sub** | `module.pubsub.google_pubsub_topic.inventory_dlq` | `projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-inventory-dlq` | Inventory DLQ |
| **Pub/Sub** | `module.pubsub.google_pubsub_topic.notification_dlq` | `projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-notification-dlq` | Notification DLQ |
| **Pub/Sub** | `module.pubsub.google_pubsub_subscription.inventory_worker` | `projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-inventory-sub` | Worker subscription |
| **Pub/Sub** | `module.pubsub.google_pubsub_subscription.notification_worker` | `projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-notification-sub` | Worker subscription |
| **Pub/Sub** | `module.pubsub.google_pubsub_subscription.inventory_dlq_sub` | `projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-inventory-dlq-sub` | Operator review sub |
| **Pub/Sub** | `module.pubsub.google_pubsub_subscription.notification_dlq_sub` | `projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-notification-dlq-sub` | Operator review sub |
| **Cloud SQL** | `module.cloud_sql.google_sql_database_instance.postgres` | `projects/project-c3f386b1-6c37-468d-8ee/instances/shopcloud-postgres` | PostgreSQL 16 (STOPPED) |
| **Cloud SQL** | `module.cloud_sql.google_sql_database.database` | `projects/project-c3f386b1-6c37-468d-8ee/instances/shopcloud-postgres/databases/shopcloud` | `shopcloud` database |
| **Cloud Run** | `module.cloud_run.google_cloud_run_v2_service.api` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-api` | Cloud Run API service |
| **Cloud Run** | `module.cloud_run.google_cloud_run_v2_service.web` | `projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-web` | Cloud Run Web service |

---

## 3. Step-by-Step Resource Import Runbook

> [!IMPORTANT]
> Never run `terraform import` without an approved plan and explicit user authorization. Always back up state prior to importing resources.

To import existing GCP infrastructure into Terraform state, execute the following commands sequentially from `infrastructure/terraform/environments/dev`:

```bash
cd infrastructure/terraform/environments/dev

# 1. IAM Service Accounts
terraform import module.iam.google_service_account.api_runtime \
  projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com

terraform import module.iam.google_service_account.web_runtime \
  projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-web-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com

terraform import module.iam.google_service_account.worker_runtime \
  projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-worker-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com

terraform import module.iam.google_service_account.github_deployer \
  projects/project-c3f386b1-6c37-468d-8ee/serviceAccounts/shopcloud-github-deployer@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com

# 2. Workload Identity Federation
terraform import module.iam.google_iam_workload_identity_pool.github_pool \
  projects/project-c3f386b1-6c37-468d-8ee/locations/global/workloadIdentityPools/shopcloud-github-pool

terraform import module.iam.google_iam_workload_identity_pool_provider.github_provider \
  projects/project-c3f386b1-6c37-468d-8ee/locations/global/workloadIdentityPools/shopcloud-github-pool/providers/github-actions

# 3. Artifact Registry
terraform import module.artifact_registry.google_artifact_registry_repository.docker_repo \
  projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/repositories/shopcloud

# 4. Storage Bucket
terraform import module.storage.google_storage_bucket.media_bucket \
  shopcloud-media-24903284190

# 5. Secret Manager Metadata
terraform import 'module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-database-url"]' \
  projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-database-url

terraform import 'module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-jwt-access-secret"]' \
  projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-jwt-access-secret

terraform import 'module.secret_manager.google_secret_manager_secret.secrets["shopcloud-dev-jwt-refresh-secret"]' \
  projects/project-c3f386b1-6c37-468d-8ee/secrets/shopcloud-dev-jwt-refresh-secret

# 6. Pub/Sub Topics
terraform import module.pubsub.google_pubsub_topic.domain_events \
  projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-domain-events

terraform import module.pubsub.google_pubsub_topic.inventory_dlq \
  projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-inventory-dlq

terraform import module.pubsub.google_pubsub_topic.notification_dlq \
  projects/project-c3f386b1-6c37-468d-8ee/topics/shopcloud-notification-dlq

# 7. Pub/Sub Subscriptions
terraform import module.pubsub.google_pubsub_subscription.inventory_worker \
  projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-inventory-sub

terraform import module.pubsub.google_pubsub_subscription.notification_worker \
  projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-notification-sub

terraform import module.pubsub.google_pubsub_subscription.inventory_dlq_sub \
  projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-inventory-dlq-sub

terraform import module.pubsub.google_pubsub_subscription.notification_dlq_sub \
  projects/project-c3f386b1-6c37-468d-8ee/subscriptions/shopcloud-notification-dlq-sub

# 8. Cloud SQL
terraform import module.cloud_sql.google_sql_database_instance.postgres \
  projects/project-c3f386b1-6c37-468d-8ee/instances/shopcloud-postgres

terraform import module.cloud_sql.google_sql_database.database \
  projects/project-c3f386b1-6c37-468d-8ee/instances/shopcloud-postgres/databases/shopcloud

# 9. Cloud Run v2 Services
terraform import module.cloud_run.google_cloud_run_v2_service.api \
  projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-api

terraform import module.cloud_run.google_cloud_run_v2_service.web \
  projects/project-c3f386b1-6c37-468d-8ee/locations/asia-south1/services/shopcloud-web
```

---

## 4. Remote State Backend Bootstrap Procedure

To migrate from local state to a central remote GCS backend when approved:

### Step 1: Request & Obtain Explicit Cost Approval
Provisioning a new storage bucket requires explicit user approval under the zero-cost policy.

### Step 2: Provision the State Storage Bucket (Out-of-Band or Admin Script)
```bash
gcloud storage buckets create gs://shopcloud-tfstate-24903284190 \
  --project=project-c3f386b1-6c37-468d-8ee \
  --location=asia-south1 \
  --default-storage-class=STANDARD \
  --uniform-bucket-level-access
```

Enable object versioning for state audit trail and disaster recovery:
```bash
gcloud storage buckets update gs://shopcloud-tfstate-24903284190 --versioning
```

### Step 3: Enable the Backend in `versions.tf`
Uncomment the `backend "gcs"` block in `infrastructure/terraform/environments/dev/versions.tf`:
```hcl
terraform {
  backend "gcs" {
    bucket = "shopcloud-tfstate-24903284190"
    prefix = "terraform/state/dev"
  }
}
```

### Step 4: Migrate State to GCS
```bash
cd infrastructure/terraform/environments/dev
terraform init -migrate-state
```
Confirm migration when prompted. Terraform securely transfers the state payload to the versioned GCS bucket with state locking.

---

## 5. State Backup and Disaster Recovery

1. **Local State Backups**:
   - Before executing state changes or imports, always create a timestamped backup:
     ```bash
     cp terraform.tfstate "terraform.tfstate.backup.$(date +%Y%m%d%H%M%S)"
     ```
2. **State Locking**:
   - GCS backend automatically acquires an exclusive lock via Cloud Storage object preconditions (`x-goog-if-generation-match`) during write operations to prevent concurrent modifications.
3. **Emergency Lock Release**:
   - If a run is interrupted abruptly and leaves a stale lock:
     ```bash
     terraform force-unlock <LOCK-ID>
     ```
     Only run `force-unlock` after confirming no other pipeline or engineer is actively executing Terraform.
