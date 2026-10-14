output "api_runtime_email" {
  description = "Email of the API runtime service account"
  value       = google_service_account.api_runtime.email
}

output "web_runtime_email" {
  description = "Email of the Web runtime service account"
  value       = google_service_account.web_runtime.email
}

output "worker_runtime_email" {
  description = "Email of the Worker runtime service account"
  value       = google_service_account.worker_runtime.email
}

output "github_deployer_email" {
  description = "Email of the GitHub Actions deployer service account"
  value       = google_service_account.github_deployer.email
}

output "wif_pool_id" {
  description = "Workload Identity Pool ID"
  value       = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
}

output "wif_provider_id" {
  description = "Workload Identity Provider ID"
  value       = google_iam_workload_identity_pool_provider.github_actions.workload_identity_pool_provider_id
}
