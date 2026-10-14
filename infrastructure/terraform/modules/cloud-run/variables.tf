variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for Cloud Run"
  type        = string
  default     = "asia-south1"
}

variable "cloudsql_connection_name" {
  description = "Cloud SQL instance connection name"
  type        = string
  default     = "project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres"
}

variable "media_bucket_name" {
  description = "Cloud Storage media bucket name"
  type        = string
  default     = "shopcloud-media-24903284190"
}

variable "api_sa_email" {
  description = "Email of the API runtime service account"
  type        = string
}

variable "web_sa_email" {
  description = "Email of the Web runtime service account"
  type        = string
}

variable "deployer_sa_email" {
  description = "Email of the GitHub Actions deployer service account"
  type        = string
}

variable "api_container_image" {
  description = "Base image tag for the API Gateway service"
  type        = string
  default     = "asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/api:65049142edf23a7f658e4bf1e49ed060a2078db3"
}

variable "web_container_image" {
  description = "Base image tag for the Web storefront service"
  type        = string
  default     = "asia-south1-docker.pkg.dev/project-c3f386b1-6c37-468d-8ee/shopcloud/web:65049142edf23a7f658e4bf1e49ed060a2078db3"
}

variable "labels" {
  description = "Labels to apply to Cloud Run services"
  type        = map(string)
  default     = {}
}
