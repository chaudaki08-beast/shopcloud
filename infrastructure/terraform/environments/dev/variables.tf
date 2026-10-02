variable "project_id" {
  type        = string
  description = "GCP Project ID"
}

variable "project_name" {
  type    = string
  default = "shopcloud"
}

variable "environment" {
  type    = string
  default = "dev"
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "db_password" {
  type        = string
  sensitive   = true
  description = "Master password for Cloud SQL PostgreSQL instance"
}

variable "api_container_image" {
  type        = string
  description = "Artifact Registry URL for the ShopCloud API image"
  default     = "asia-south1-docker.pkg.dev/shopcloud-dev/shopcloud/api:latest"
}

variable "alert_email" {
  type    = string
  default = "devops@shopcloud.dev"
}
