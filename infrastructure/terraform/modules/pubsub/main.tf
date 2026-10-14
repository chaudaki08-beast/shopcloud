# ------------------------------------------------------------------------------
# ShopCloud Google Cloud Pub/Sub Event-Driven Infrastructure
# Domain events topic, worker subscriptions, dead-letter topics & retry policies
# ------------------------------------------------------------------------------

# 1. Dead-Letter Topics
resource "google_pubsub_topic" "inventory_dlq" {
  name    = "shopcloud-inventory-dlq"
  project = var.project_id
  labels  = var.labels
}

resource "google_pubsub_topic" "notification_dlq" {
  name    = "shopcloud-notification-dlq"
  project = var.project_id
  labels  = var.labels
}

# 2. Primary Domain Events Topic
resource "google_pubsub_topic" "domain_events" {
  name    = "shopcloud-domain-events"
  project = var.project_id
  labels  = var.labels
}

# 3. Worker Subscriptions with Ordering & Dead-Letter Handling
resource "google_pubsub_subscription" "inventory_sub" {
  name                       = "shopcloud-inventory-sub"
  topic                      = google_pubsub_topic.domain_events.name
  project                    = var.project_id
  ack_deadline_seconds       = 30
  message_retention_duration = "604800s" # 7 days
  enable_message_ordering    = true

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.inventory_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

resource "google_pubsub_subscription" "notification_sub" {
  name                       = "shopcloud-notification-sub"
  topic                      = google_pubsub_topic.domain_events.name
  project                    = var.project_id
  ack_deadline_seconds       = 30
  message_retention_duration = "604800s" # 7 days
  enable_message_ordering    = true

  dead_letter_policy {
    dead_letter_topic     = google_pubsub_topic.notification_dlq.id
    max_delivery_attempts = 5
  }

  retry_policy {
    minimum_backoff = "10s"
    maximum_backoff = "600s"
  }
}

# 4. Dead-Letter Review Subscriptions for Operators
resource "google_pubsub_subscription" "inventory_dlq_sub" {
  name                       = "shopcloud-inventory-dlq-sub"
  topic                      = google_pubsub_topic.inventory_dlq.name
  project                    = var.project_id
  ack_deadline_seconds       = 10
  message_retention_duration = "604800s" # 7 days
}

resource "google_pubsub_subscription" "notification_dlq_sub" {
  name                       = "shopcloud-notification-dlq-sub"
  topic                      = google_pubsub_topic.notification_dlq.name
  project                    = var.project_id
  ack_deadline_seconds       = 10
  message_retention_duration = "604800s" # 7 days
}

# 5. Least-Privilege IAM Bindings

# Domain events publishers (API and Workers)
resource "google_pubsub_topic_iam_member" "api_publisher" {
  topic   = google_pubsub_topic.domain_events.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.api_sa_email}"
  project = var.project_id
}

resource "google_pubsub_topic_iam_member" "worker_publisher" {
  topic   = google_pubsub_topic.domain_events.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:${var.worker_sa_email}"
  project = var.project_id
}

# Worker subscription subscribers
resource "google_pubsub_subscription_iam_member" "worker_inventory_subscriber" {
  subscription = google_pubsub_subscription.inventory_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${var.worker_sa_email}"
  project      = var.project_id
}

resource "google_pubsub_subscription_iam_member" "worker_notification_subscriber" {
  subscription = google_pubsub_subscription.notification_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:${var.worker_sa_email}"
  project      = var.project_id
}

# Google-managed Pub/Sub service agent grants for DLQ forwarding
resource "google_pubsub_subscription_iam_member" "pubsub_agent_inventory_sub" {
  subscription = google_pubsub_subscription.inventory_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  project      = var.project_id
}

resource "google_pubsub_subscription_iam_member" "pubsub_agent_notification_sub" {
  subscription = google_pubsub_subscription.notification_sub.name
  role         = "roles/pubsub.subscriber"
  member       = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  project      = var.project_id
}

resource "google_pubsub_topic_iam_member" "pubsub_agent_inventory_dlq_pub" {
  topic   = google_pubsub_topic.inventory_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  project = var.project_id
}

resource "google_pubsub_topic_iam_member" "pubsub_agent_notification_dlq_pub" {
  topic   = google_pubsub_topic.notification_dlq.name
  role    = "roles/pubsub.publisher"
  member  = "serviceAccount:service-${var.project_number}@gcp-sa-pubsub.iam.gserviceaccount.com"
  project = var.project_id
}
