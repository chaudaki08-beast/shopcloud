# Dead-Letter Topic
resource "google_pubsub_topic" "dead_letter" {
  name = "${var.project_name}-${var.environment}-dead-letter"
}

# Main Topics
resource "google_pubsub_topic" "order_created" {
  name = "${var.project_name}-${var.environment}-order-created"
}

resource "google_pubsub_topic" "payment_completed" {
  name = "${var.project_name}-${var.environment}-payment-completed"
}

resource "google_pubsub_topic" "payment_failed" {
  name = "${var.project_name}-${var.environment}-payment-failed"
}

resource "google_pubsub_topic" "inventory_updated" {
  name = "${var.project_name}-${var.environment}-inventory-updated"
}

resource "google_pubsub_topic" "notification_requested" {
  name = "${var.project_name}-${var.environment}-notification-requested"
}

# Subscriptions with Dead Letter Policy & Retry Settings
resource "google_pubsub_subscription" "inventory_worker_sub" {
  name  = "${var.project_name}-${var.environment}-inventory-sub"
  topic = google_pubsub_topic.order_created.name

  ack_deadline_seconds       = 60
  message_retention_duration = "604800s" # 7 days

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_subscription" "notification_worker_sub" {
  name  = "${var.project_name}-${var.environment}-notification-sub"
  topic = google_pubsub_topic.notification_requested.name

  ack_deadline_seconds = 30

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.dead_letter.id
    max_delivery_attempts = 5
  }
}

output "order_created_topic" {
  value = google_pubsub_topic.order_created.name
}

output "payment_completed_topic" {
  value = google_pubsub_topic.payment_completed.name
}

output "notification_requested_topic" {
  value = google_pubsub_topic.notification_requested.name
}
