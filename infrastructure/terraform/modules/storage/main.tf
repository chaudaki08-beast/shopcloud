resource "google_storage_bucket" "media_bucket" {
  name          = "${var.project_name}-${var.environment}-media"
  location      = var.region
  force_destroy = var.environment == "prod" ? false : true

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  cors {
    origin          = ["*"]
    method          = ["GET", "HEAD", "PUT", "POST"]
    response_header = ["*"]
    max_age_seconds = 3600
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }
}

output "media_bucket_name" {
  value = google_storage_bucket.media_bucket.name
}

output "media_bucket_url" {
  value = google_storage_bucket.media_bucket.url
}
