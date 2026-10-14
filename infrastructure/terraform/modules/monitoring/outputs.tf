output "dashboard_id" {
  description = "The resource ID of the Cloud Monitoring operational dashboard."
  value       = google_monitoring_dashboard.shopcloud_ops.id
}

output "alert_policy_ids" {
  description = "Map of alert policy names to their Cloud Monitoring resource IDs."
  value = {
    api_5xx_rate    = google_monitoring_alert_policy.api_5xx_rate.id
    api_p95_latency = google_monitoring_alert_policy.api_p95_latency.id
    pubsub_backlog  = google_monitoring_alert_policy.pubsub_backlog.id
    dlq_messages    = google_monitoring_alert_policy.dlq_messages.id
  }
}
