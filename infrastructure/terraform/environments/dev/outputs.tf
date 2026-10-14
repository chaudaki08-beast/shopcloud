# ------------------------------------------------------------------------------
# ShopCloud Infrastructure Outputs — Dev Environment
# Descriptive, strictly non-sensitive infrastructure identifiers
# ------------------------------------------------------------------------------

output "project_id" {
  description = "Google Cloud Project ID"
  value       = var.project_id
}

output "region" {
  description = "GCP Region"
  value       = var.region
}

output "cloud_sql_instance_name" {
  description = "Cloud SQL Instance Name"
  value       = module.cloud_sql.instance_name
}

output "cloud_sql_connection_name" {
  description = "Cloud SQL Connection String"
  value       = module.cloud_sql.connection_name
}

output "media_bucket_name" {
  description = "Cloud Storage Media Bucket"
  value       = module.storage.media_bucket_name
}

output "media_bucket_url" {
  description = "Cloud Storage Media Bucket URL"
  value       = module.storage.media_bucket_url
}

output "pubsub_domain_events_topic" {
  description = "Pub/Sub Primary Domain Events Topic"
  value       = module.pubsub.domain_events_topic
}

output "pubsub_inventory_subscription" {
  description = "Pub/Sub Inventory Worker Subscription"
  value       = module.pubsub.inventory_sub
}

output "pubsub_notification_subscription" {
  description = "Pub/Sub Notification Worker Subscription"
  value       = module.pubsub.notification_sub
}

output "artifact_registry_id" {
  description = "Artifact Registry Repository ID"
  value       = module.artifact_registry.repository_id
}

output "api_service_url" {
  description = "Cloud Run API Service URL"
  value       = module.cloud_run.api_service_url
}

output "web_service_url" {
  description = "Cloud Run Web Storefront Service URL"
  value       = module.cloud_run.web_service_url
}

output "wif_pool_id" {
  description = "Workload Identity Pool ID"
  value       = module.iam.wif_pool_id
}

output "monitoring_dashboard_id" {
  description = "Cloud Monitoring Operational Dashboard ID"
  value       = module.monitoring.dashboard_id
}

output "monitoring_alert_policy_ids" {
  description = "Cloud Monitoring Alert Policy IDs"
  value       = module.monitoring.alert_policy_ids
}

