# ------------------------------------------------------------------------------
# ShopCloud Secret Manager Module (Metadata & IAM only)
# Never manages or outputs sensitive payloads; preserves existing values in GCP
# ------------------------------------------------------------------------------

# 1. Database Connection URL Secret
resource "google_secret_manager_secret" "database_url" {
  secret_id = "shopcloud-dev-database-url"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = merge(var.labels, {
    component = "database"
  })
}

# Accessor grants for API runtime and Worker runtime
resource "google_secret_manager_secret_iam_member" "db_url_api_accessor" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_sa_email}"
  project   = var.project_id
}

resource "google_secret_manager_secret_iam_member" "db_url_worker_accessor" {
  secret_id = google_secret_manager_secret.database_url.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.worker_sa_email}"
  project   = var.project_id
}

# 2. JWT Access Secret
resource "google_secret_manager_secret" "jwt_access_secret" {
  secret_id = "shopcloud-dev-jwt-access-secret"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = merge(var.labels, {
    component = "api"
  })
}

resource "google_secret_manager_secret_iam_member" "jwt_access_api_accessor" {
  secret_id = google_secret_manager_secret.jwt_access_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_sa_email}"
  project   = var.project_id
}

# 3. JWT Refresh Secret
resource "google_secret_manager_secret" "jwt_refresh_secret" {
  secret_id = "shopcloud-dev-jwt-refresh-secret"
  project   = var.project_id

  replication {
    user_managed {
      replicas {
        location = var.region
      }
    }
  }

  labels = merge(var.labels, {
    component = "api"
  })
}

resource "google_secret_manager_secret_iam_member" "jwt_refresh_api_accessor" {
  secret_id = google_secret_manager_secret.jwt_refresh_secret.secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${var.api_sa_email}"
  project   = var.project_id
}
