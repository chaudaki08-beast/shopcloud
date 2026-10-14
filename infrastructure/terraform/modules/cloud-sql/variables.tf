variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "instance_name" {
  description = "Name of the Cloud SQL instance"
  type        = string
  default     = "shopcloud-postgres"
}

variable "region" {
  description = "GCP Region for Cloud SQL"
  type        = string
  default     = "asia-south1"
}

variable "zone" {
  description = "GCP Zone for Cloud SQL instance location preference"
  type        = string
  default     = "asia-south1-c"
}

variable "database_version" {
  description = "PostgreSQL engine version"
  type        = string
  default     = "POSTGRES_16"
}

variable "tier" {
  description = "Machine tier for the database instance"
  type        = string
  default     = "db-custom-1-3840"
}

variable "activation_policy" {
  description = "Instance activation policy. Default is NEVER to preserve stopped state for cost control."
  type        = string
  default     = "NEVER"
}

variable "deletion_protection" {
  description = "Guards against accidental deletion"
  type        = bool
  default     = true
}

variable "database_name" {
  description = "Name of the logical PostgreSQL database"
  type        = string
  default     = "shopcloud"
}

variable "api_sa_email" {
  description = "Email of the API runtime service account for cloudsql.client grant"
  type        = string
}

variable "worker_sa_email" {
  description = "Email of the Worker runtime service account for cloudsql.client grant"
  type        = string
}
