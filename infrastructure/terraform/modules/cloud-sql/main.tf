resource "google_sql_database_instance" "postgres" {
  name             = "${var.project_name}-${var.environment}-db"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [var.vpc_connection_dependency]

  settings {
    tier              = var.tier
    availability_type = var.environment == "prod" ? "REGIONAL" : "ZONAL"
    disk_size         = 20
    disk_type         = "PD_SSD"

    ip_configuration {
      ipv4_enabled    = false
      private_network = var.network_id
    }

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = 7
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  deletion_protection = var.environment == "prod" ? true : false
}

resource "google_sql_database" "database" {
  name     = var.database_name
  instance = google_sql_database_instance.postgres.name
}

resource "google_sql_user" "users" {
  name     = var.db_user
  instance = google_sql_database_instance.postgres.name
  password = var.db_password
}

output "instance_connection_name" {
  value = google_sql_database_instance.postgres.connection_name
}

output "private_ip_address" {
  value = google_sql_database_instance.postgres.private_ip_address
}
