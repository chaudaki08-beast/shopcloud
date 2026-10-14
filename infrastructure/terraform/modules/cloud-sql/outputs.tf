output "instance_name" {
  description = "Name of the Cloud SQL instance"
  value       = google_sql_database_instance.postgres.name
}

output "connection_name" {
  description = "Cloud SQL instance connection string for Cloud Run unix socket proxy"
  value       = google_sql_database_instance.postgres.connection_name
}

output "database_name" {
  description = "Name of the logical database"
  value       = google_sql_database.shopcloud.name
}
