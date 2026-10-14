# ------------------------------------------------------------------------------
# ShopCloud Google Cloud SQL PostgreSQL Module
# Enterprise Edition PostgreSQL 16 with zero-cost activation policy (NEVER / STOPPED)
# ------------------------------------------------------------------------------

resource "google_sql_database_instance" "postgres" {
  name             = var.instance_name
  database_version = var.database_version
  region           = var.region
  project          = var.project_id

  settings {
    tier              = var.tier
    edition           = "ENTERPRISE"
    activation_policy = var.activation_policy
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled = true
      ssl_mode     = "ALLOW_UNENCRYPTED_AND_ENCRYPTED"
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "20:00"
      transaction_log_retention_days = 7

      backup_retention_settings {
        retained_backups = 7
        retention_unit   = "COUNT"
      }
    }

    location_preference {
      zone = var.zone
    }

    maintenance_window {
      day  = 7
      hour = 21
    }
  }

  deletion_protection = var.deletion_protection

  lifecycle {
    # Prevent destructive replacements and accidental reboots from minor settings drifts
    prevent_destroy = true
    ignore_changes = [
      settings[0].disk_size,
    ]
  }
}

resource "google_sql_database" "shopcloud" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
  project  = var.project_id
}

# Least-privilege IAM: Cloud SQL Client role granted to API and Worker runtimes
resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${var.api_sa_email}"
}

resource "google_project_iam_member" "worker_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${var.worker_sa_email}"
}
