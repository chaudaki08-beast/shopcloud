output "api_service_name" {
  description = "Name of the API Cloud Run service"
  value       = google_cloud_run_v2_service.api.name
}

output "api_service_url" {
  description = "Public URL of the API Cloud Run service"
  value       = google_cloud_run_v2_service.api.uri
}

output "web_service_name" {
  description = "Name of the Web storefront Cloud Run service"
  value       = google_cloud_run_v2_service.web.name
}

output "web_service_url" {
  description = "Public URL of the Web storefront Cloud Run service"
  value       = google_cloud_run_v2_service.web.uri
}
