# ------------------------------------------------------------------------------
# ShopCloud Infrastructure as Code — Development Environment
# Root composition module orchestrating all verified GCP components
# ------------------------------------------------------------------------------

# 1. IAM & Workload Identity Federation
module "iam" {
  source                     = "../../modules/iam"
  project_id                 = var.project_id
  github_repository_id       = var.github_repository_id
  github_repository_owner_id = var.github_repository_owner_id
}

# 2. Container Registry (Artifact Registry)
module "artifact_registry" {
  source            = "../../modules/artifact-registry"
  project_id        = var.project_id
  region            = var.region
  deployer_sa_email = module.iam.github_deployer_email
  labels            = local.common_labels
}

# 3. Secret Manager (Metadata & IAM only; zero payload exposure)
module "secret_manager" {
  source          = "../../modules/secret-manager"
  project_id      = var.project_id
  region          = var.region
  api_sa_email    = module.iam.api_runtime_email
  worker_sa_email = module.iam.worker_runtime_email
  labels          = local.common_labels
}

# 4. Durable Object Storage (Cloud Storage Media Bucket)
module "storage" {
  source       = "../../modules/storage"
  project_id   = var.project_id
  location     = "ASIA-SOUTH1"
  api_sa_email = module.iam.api_runtime_email
  labels       = local.common_labels
}

# 5. Event-Driven Messaging (Cloud Pub/Sub)
module "pubsub" {
  source          = "../../modules/pubsub"
  project_id      = var.project_id
  project_number  = var.project_number
  api_sa_email    = module.iam.api_runtime_email
  worker_sa_email = module.iam.worker_runtime_email
  labels          = local.common_labels
}

# 6. Relational Database (Cloud SQL PostgreSQL 16)
module "cloud_sql" {
  source            = "../../modules/cloud-sql"
  project_id        = var.project_id
  region            = var.region
  zone              = var.zone
  activation_policy = "NEVER" # Zero-cost policy: instance preserved in STOPPED state
  api_sa_email      = module.iam.api_runtime_email
  worker_sa_email   = module.iam.worker_runtime_email
}

# 7. Compute Layer (Cloud Run Services)
module "cloud_run" {
  source                   = "../../modules/cloud-run"
  project_id               = var.project_id
  region                   = var.region
  cloudsql_connection_name = module.cloud_sql.connection_name
  media_bucket_name        = module.storage.media_bucket_name
  api_sa_email             = module.iam.api_runtime_email
  web_sa_email             = module.iam.web_runtime_email
  deployer_sa_email        = module.iam.github_deployer_email
  labels                   = local.common_labels
}
