output "repository_id" {
  description = "Artifact Registry repository ID"
  value       = google_artifact_registry_repository.shopcloud.repository_id
}

output "repository_name" {
  description = "Artifact Registry resource name"
  value       = google_artifact_registry_repository.shopcloud.name
}
