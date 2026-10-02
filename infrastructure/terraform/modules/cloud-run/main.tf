resource "google_cloud_run_v2_service" "api_service" {
  name     = "${var.project_name}-${var.environment}-api"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = var.service_account_email

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    containers {
      image = var.container_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = var.environment
      }

      env {
        name  = "PORT"
        value = "3000"
      }

      env {
        name  = "DATABASE_URL"
        value = var.database_url
      }

      startup_probe {
        http_get {
          path = "/api/v1/health"
          port = 3000
        }
        initial_delay_seconds = 5
        period_seconds        = 10
        failure_threshold     = 3
      }

      liveness_probe {
        http_get {
          path = "/api/v1/health/liveness"
          port = 3000
        }
        period_seconds = 15
      }
    }

    vpc_access {
      connector = var.vpc_connector_id
      egress    = "PRIVATE_RANGES_ONLY"
    }
  }
}

# Allow public invocations for API Gateway / Cloud Run API
resource "google_cloud_run_v2_service_iam_member" "public_invoker" {
  location = google_cloud_run_v2_service.api_service.location
  name     = google_cloud_run_v2_service.api_service.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "service_uri" {
  value = google_cloud_run_v2_service.api_service.uri
}
