output "database_url_secret_id" {
  description = "Secret ID for database URL"
  value       = google_secret_manager_secret.database_url.secret_id
}

output "jwt_access_secret_id" {
  description = "Secret ID for JWT access secret"
  value       = google_secret_manager_secret.jwt_access_secret.secret_id
}

output "jwt_refresh_secret_id" {
  description = "Secret ID for JWT refresh secret"
  value       = google_secret_manager_secret.jwt_refresh_secret.secret_id
}
