output "domain_events_topic" {
  description = "Name of the primary domain events topic"
  value       = google_pubsub_topic.domain_events.name
}

output "inventory_sub" {
  description = "Name of the inventory worker subscription"
  value       = google_pubsub_subscription.inventory_sub.name
}

output "notification_sub" {
  description = "Name of the notification worker subscription"
  value       = google_pubsub_subscription.notification_sub.name
}

output "inventory_dlq_topic" {
  description = "Name of the inventory dead-letter topic"
  value       = google_pubsub_topic.inventory_dlq.name
}

output "notification_dlq_topic" {
  description = "Name of the notification dead-letter topic"
  value       = google_pubsub_topic.notification_dlq.name
}
