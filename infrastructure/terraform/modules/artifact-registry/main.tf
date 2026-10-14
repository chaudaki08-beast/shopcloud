# ------------------------------------------------------------------------------
# ShopCloud Artifact Registry Module
# Dedicated Docker repository for immutable container images (api, web, worker)
# ------------------------------------------------------------------------------

resource "google_artifact_registry_repository" "shopcloud" {
  location      = var.region
  repository_id = var.repository_id
  description   = "ShopCloud container images (api, web, worker)"
  format        = "DOCKER"
  mode          = "STANDARD_REPOSITORY"
  project       = var.project_id
  labels        = var.labels
}

# Least-privilege writer role for GitHub Actions deployer identity
resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  location   = google_artifact_registry_repository.shopcloud.location
  repository = google_artifact_registry_repository.shopcloud.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${var.deployer_sa_email}"
  project    = var.project_id
}
