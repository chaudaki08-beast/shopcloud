/**
 * ShopCloud Google Cloud Monitoring & Observability Module (Phase 14)
 * Manages operational dashboards and alerting policies.
 * Strictly adheres to zero-cost policy: platform metrics are built-in and free within standard quotas.
 */

resource "google_monitoring_dashboard" "shopcloud_ops" {
  dashboard_json = jsonencode({
    displayName = "ShopCloud Operations Dashboard (${var.environment})"
    gridLayout = {
      columns = 2
      widgets = [
        {
          title = "Cloud Run Request Rate (req/sec)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" (resource.label.service_name=\"${var.api_service_name}\" OR resource.label.service_name=\"${var.web_service_name}\")"
                    aggregation = {
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.label.service_name", "metric.label.response_code_class"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Cloud Run Request Latencies (P95 ms)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_latencies\" resource.type=\"cloud_run_revision\" resource.label.service_name=\"${var.api_service_name}\""
                    aggregation = {
                      perSeriesAligner   = "ALIGN_PERCENTILE_95"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = ["resource.label.service_name"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Cloud Run 5xx Server Error Rate"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/request_count\" resource.type=\"cloud_run_revision\" metric.label.response_code_class=\"5xx\""
                    aggregation = {
                      perSeriesAligner   = "ALIGN_RATE"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.label.service_name"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Container CPU Utilization"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/container/cpu/utilizations\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      perSeriesAligner   = "ALIGN_PERCENTILE_95"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = ["resource.label.service_name"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Active Container Instances (Scale-to-Zero Verification)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"run.googleapis.com/container/instance_count\" resource.type=\"cloud_run_revision\""
                    aggregation = {
                      perSeriesAligner   = "ALIGN_MAX"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.label.service_name"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Pub/Sub Worker Subscription Backlog (Undelivered Messages)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" resource.type=\"pubsub_subscription\" (resource.label.subscription_id=\"${var.inventory_subscription_id}\" OR resource.label.subscription_id=\"${var.notification_subscription_id}\")"
                    aggregation = {
                      perSeriesAligner   = "ALIGN_MAX"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = ["resource.label.subscription_id"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Pub/Sub Oldest Unacknowledged Message Age (Seconds)"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"pubsub.googleapis.com/subscription/oldest_unacked_message_age\" resource.type=\"pubsub_subscription\""
                    aggregation = {
                      perSeriesAligner   = "ALIGN_MAX"
                      crossSeriesReducer = "REDUCE_MAX"
                      groupByFields      = ["resource.label.subscription_id"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        },
        {
          title = "Dead-Letter Queue (DLQ) Backlog Activity"
          xyChart = {
            dataSets = [
              {
                timeSeriesQuery = {
                  timeSeriesFilter = {
                    filter = "metric.type=\"pubsub.googleapis.com/subscription/num_undelivered_messages\" resource.type=\"pubsub_subscription\" (resource.label.subscription_id=\"${var.inventory_dlq_subscription_id}\" OR resource.label.subscription_id=\"${var.notification_dlq_subscription_id}\")"
                    aggregation = {
                      perSeriesAligner   = "ALIGN_MAX"
                      crossSeriesReducer = "REDUCE_SUM"
                      groupByFields      = ["resource.label.subscription_id"]
                      alignmentPeriod    = "60s"
                    }
                  }
                }
                plotType = "LINE"
              }
            ]
            yAxis = {
              scale = "LINEAR"
            }
          }
        }
      ]
    }
  })
}

# 1. Alert Policy: Sustained Cloud Run 5xx Server Errors
resource "google_monitoring_alert_policy" "api_5xx_rate" {
  display_name = "ShopCloud - Sustained 5xx Server Errors (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run 5xx Error Rate > 1 req/sec for 5m"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND (resource.labels.service_name = \"${var.api_service_name}\" OR resource.labels.service_name = \"${var.web_service_name}\") AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "## ShopCloud Alert: Sustained 5xx Server Error Rate\n\n**Impact**: End users are receiving HTTP 500/503 responses.\n\n**Likely Causes**:\n1. Cloud SQL database is stopped or connection pool exhausted.\n2. Container runtime unhandled exceptions or crashlooping.\n\n**Remediation Steps**:\n1. Inspect Cloud Run service logs filtered by severity >= ERROR.\n2. Check Cloud SQL instance state: `gcloud sql instances describe shopcloud-postgres`.\n3. If Cloud SQL was intentionally stopped for cost control, ensure offline demo mode or start Cloud SQL if an active demonstration is underway.\n4. Refer to incident runbook: `docs/observability/incident-runbooks.md`."
    mime_type = "text/markdown"
  }
}

# 2. Alert Policy: Excessive Request Latency (P95 > 1500ms)
resource "google_monitoring_alert_policy" "api_p95_latency" {
  display_name = "ShopCloud - High Request Latency P95 (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Cloud Run API P95 Latency > 1500ms for 5m"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${var.api_service_name}\" AND metric.type = \"run.googleapis.com/request_latencies\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 1500
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_PERCENTILE_95"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.service_name"]
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "## ShopCloud Alert: High Request Latency (P95 > 1.5s)\n\n**Impact**: Degraded customer checkout and storefront browsing responsiveness.\n\n**Likely Causes**:\n1. Database query contention or slow queries.\n2. Container cold starts or CPU throttling.\n3. External network or storage latency.\n\n**Remediation Steps**:\n1. Check active container instance count and CPU/memory utilization.\n2. Examine recent API request logs with high latency values in Cloud Logging.\n3. Check PostgreSQL lock waits and query performance."
    mime_type = "text/markdown"
  }
}

# 3. Alert Policy: Pub/Sub Worker Subscription Backlog Accumulation
resource "google_monitoring_alert_policy" "pubsub_backlog" {
  display_name = "ShopCloud - PubSub Worker Backlog Accumulation (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "Worker Undelivered Backlog > 100 Messages for 10m"
    condition_threshold {
      filter          = "resource.type = \"pubsub_subscription\" AND (resource.labels.subscription_id = \"${var.inventory_subscription_id}\" OR resource.labels.subscription_id = \"${var.notification_subscription_id}\") AND metric.type = \"pubsub.googleapis.com/subscription/num_undelivered_messages\""
      duration        = "600s"
      comparison      = "COMPARISON_GT"
      threshold_value = 100
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_MAX"
        group_by_fields      = ["resource.label.subscription_id"]
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "## ShopCloud Alert: Pub/Sub Worker Backlog Accumulating\n\n**Impact**: Asynchronous orders, inventory reservations, or notifications are delayed.\n\n**Likely Causes**:\n1. Worker service is stopped, crashing, or unreachable via push delivery.\n2. Downstream database or storage operations are throwing unhandled errors.\n\n**Remediation Steps**:\n1. Check worker container logs for repeated push errors.\n2. Verify the push subscription endpoint `/pubsub/push` is responding with HTTP 200/204."
    mime_type = "text/markdown"
  }
}

# 4. Alert Policy: Dead-Letter Queue (DLQ) Accumulation
resource "google_monitoring_alert_policy" "dlq_messages" {
  display_name = "ShopCloud - Dead Letter Queue Activity (${var.environment})"
  combiner     = "OR"

  conditions {
    display_name = "DLQ Messages Detected > 0 for 5m"
    condition_threshold {
      filter          = "resource.type = \"pubsub_subscription\" AND (resource.labels.subscription_id = \"${var.inventory_dlq_subscription_id}\" OR resource.labels.subscription_id = \"${var.notification_dlq_subscription_id}\") AND metric.type = \"pubsub.googleapis.com/subscription/num_undelivered_messages\""
      duration        = "300s"
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_MAX"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.subscription_id"]
      }
    }
  }

  notification_channels = var.notification_channels

  documentation {
    content   = "## ShopCloud Alert: Dead-Letter Queue (DLQ) Activity\n\n**Impact**: Poison-pill or repeatedly failing messages exceeded maximum delivery attempts (5 retries).\n\n**Likely Causes**:\n1. Malformed payload or unrecoverable business validation error.\n2. Permanent inventory or customer data inconsistency.\n\n**Remediation Steps**:\n1. Inspect DLQ messages using operator subscription: `gcloud pubsub subscriptions pull ${var.inventory_dlq_subscription_id} --limit=5`.\n2. Review error cause and replay or purge according to `docs/observability/incident-runbooks.md`."
    mime_type = "text/markdown"
  }
}
