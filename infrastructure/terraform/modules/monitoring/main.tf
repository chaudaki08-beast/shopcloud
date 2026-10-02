# Notification Channel (Email Alert)
resource "google_monitoring_notification_channel" "email" {
  display_name = "ShopCloud DevOps Alerts"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
}

# 1. Alert: 5xx Error Rate > 5%
resource "google_monitoring_alert_policy" "high_5xx_errors" {
  display_name = "ShopCloud - High 5xx Error Rate (> 5%)"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx error rate is elevated"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "60s"
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
}

# 2. Alert: P95 Latency > 1000ms
resource "google_monitoring_alert_policy" "high_latency" {
  display_name = "ShopCloud - High Latency (P95 > 1s)"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run P95 latency exceeds 1s"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "120s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1000 # milliseconds
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.name]
}
