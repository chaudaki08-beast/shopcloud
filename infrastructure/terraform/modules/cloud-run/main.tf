# ------------------------------------------------------------------------------
# ShopCloud Google Cloud Run Services Module
# High-concurrency serverless container workloads (API Gateway and Web Storefront)
# ------------------------------------------------------------------------------

# 1. API Gateway Cloud Run Service
resource "google_cloud_run_v2_service" "api" {
  name     = "shopcloud-api"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  labels = merge(var.labels, {
    component = "api"
  })

  template {
    service_account                  = var.api_sa_email
    max_instance_request_concurrency = 40

    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }

    annotations = {
      "run.googleapis.com/cloudsql-instances" = var.cloudsql_connection_name
      "run.googleapis.com/startup-cpu-boost"  = "true"
    }

    containers {
      image = var.api_container_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }

      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }

      env {
        name  = "TRUST_PROXY_HOPS"
        value = "1"
      }

      env {
        name  = "RELEASE"
        value = "phase9-cloudstorage"
      }

      env {
        name  = "GCS_MEDIA_BUCKET"
        value = var.media_bucket_name
      }

      env {
        name  = "GCS_BUCKET_NAME"
        value = var.media_bucket_name
      }

      env {
        name = "JWT_ACCESS_SECRET"
        value_source {
          secret_key_ref {
            secret  = "shopcloud-dev-jwt-access-secret"
            version = "2"
          }
        }
      }

      env {
        name = "DATABASE_URL"
        value_source {
          secret_key_ref {
            secret  = "shopcloud-dev-database-url"
            version = "latest"
          }
        }
      }

      env {
        name = "JWT_REFRESH_SECRET"
        value_source {
          secret_key_ref {
            secret  = "shopcloud-dev-jwt-refresh-secret"
            version = "latest"
          }
        }
      }

      startup_probe {
        http_get {
          path = "/api/v1/health/liveness"
          port = 8080
        }
        period_seconds    = 5
        timeout_seconds   = 3
        failure_threshold = 24
      }

      liveness_probe {
        http_get {
          path = "/api/v1/health/liveness"
          port = 8080
        }
        period_seconds    = 30
        timeout_seconds   = 3
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    # Allow CI/CD to deploy new container images without Terraform reverting them
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
      template[0].labels["client.knative.dev/nonce"],
      template[0].labels["commit-sha"],
      template[0].labels["git-sha"],
      labels["commit-sha"],
      labels["git-sha"],
    ]
  }
}

# Public invoker permission for API Gateway
resource "google_cloud_run_v2_service_iam_member" "api_public_invoker" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.invoker"
  member   = "allUsers"
  project  = var.project_id
}

# Developer role for GitHub Actions deployer identity
resource "google_cloud_run_v2_service_iam_member" "api_deployer_developer" {
  location = google_cloud_run_v2_service.api.location
  name     = google_cloud_run_v2_service.api.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_sa_email}"
  project  = var.project_id
}

# 2. Web Storefront Cloud Run Service
resource "google_cloud_run_v2_service" "web" {
  name     = "shopcloud-web"
  location = var.region
  project  = var.project_id
  ingress  = "INGRESS_TRAFFIC_ALL"

  labels = merge(var.labels, {
    component = "web"
  })

  template {
    service_account                  = var.web_sa_email
    max_instance_request_concurrency = 80

    scaling {
      min_instance_count = 0
      max_instance_count = 20
    }

    annotations = {
      "run.googleapis.com/startup-cpu-boost" = "true"
    }

    containers {
      image = var.web_container_image

      resources {
        limits = {
          cpu    = "1"
          memory = "256Mi"
        }
      }

      ports {
        container_port = 8080
      }

      env {
        name  = "API_UPSTREAM"
        value = "https://shopcloud-api-24903284190.asia-south1.run.app"
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 3
        timeout_seconds   = 2
        failure_threshold = 10
      }

      liveness_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        period_seconds    = 30
        timeout_seconds   = 2
        failure_threshold = 3
      }
    }
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].containers[0].image,
      template[0].labels["client.knative.dev/nonce"],
      template[0].labels["commit-sha"],
      template[0].labels["git-sha"],
      labels["commit-sha"],
      labels["git-sha"],
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "web_public_invoker" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.invoker"
  member   = "allUsers"
  project  = var.project_id
}

resource "google_cloud_run_v2_service_iam_member" "web_deployer_developer" {
  location = google_cloud_run_v2_service.web.location
  name     = google_cloud_run_v2_service.web.name
  role     = "roles/run.developer"
  member   = "serviceAccount:${var.deployer_sa_email}"
  project  = var.project_id
}
