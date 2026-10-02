# API Service Account
resource "google_service_account" "api_sa" {
  account_id   = "${var.project_name}-${var.environment}-api"
  display_name = "ShopCloud API Service Account"
}

# Worker Service Account
resource "google_service_account" "worker_sa" {
  account_id   = "${var.project_name}-${var.environment}-worker"
  display_name = "ShopCloud Worker Service Account"
}

# API SA IAM Bindings
resource "google_project_iam_member" "api_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_pubsub_pub" {
  project = var.project_id
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_storage" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

resource "google_project_iam_member" "api_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.api_sa.email}"
}

# Worker SA IAM Bindings
resource "google_project_iam_member" "worker_cloudsql" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_pubsub_sub" {
  project = var.project_id
  role    = "roles/pubsub.subscriber"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

resource "google_project_iam_member" "worker_secrets" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${google_service_account.worker_sa.email}"
}

output "api_service_account_email" {
  value = google_service_account.api_sa.email
}

output "worker_service_account_email" {
  value = google_service_account.worker_sa.email
}
