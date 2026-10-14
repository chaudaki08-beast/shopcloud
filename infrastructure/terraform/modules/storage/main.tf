# ------------------------------------------------------------------------------
# ShopCloud Google Cloud Storage Module
# Product media durable object storage with UBLA, PAP, and lifecycle rules
# ------------------------------------------------------------------------------

resource "google_storage_bucket" "media_bucket" {
  name                        = var.bucket_name
  location                    = var.location
  project                     = var.project_id
  storage_class               = var.storage_class
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = var.labels

  soft_delete_policy {
    retention_duration_seconds = 604800 # 7 days
  }

  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 7
    }
  }
}

# Least-privilege objectUser role on the bucket for API runtime service account
resource "google_storage_bucket_iam_member" "api_object_user" {
  bucket = google_storage_bucket.media_bucket.name
  role   = "roles/storage.objectUser"
  member = "serviceAccount:${var.api_sa_email}"
}
