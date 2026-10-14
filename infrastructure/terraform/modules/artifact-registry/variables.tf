variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "GCP Region for the Artifact Registry repository"
  type        = string
  default     = "asia-south1"
}

variable "repository_id" {
  description = "The repository ID"
  type        = string
  default     = "shopcloud"
}

variable "deployer_sa_email" {
  description = "Email of the deployer service account to grant artifactregistry.writer"
  type        = string
}

variable "labels" {
  description = "Labels to apply to the repository"
  type        = map(string)
  default     = {}
}
