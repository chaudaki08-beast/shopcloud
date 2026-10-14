variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "project_number" {
  description = "The Google Cloud Project Number (used for GCP Pub/Sub service agent IAM)"
  type        = string
  default     = "24903284190"
}

variable "api_sa_email" {
  description = "Email of the API runtime service account (publisher)"
  type        = string
}

variable "worker_sa_email" {
  description = "Email of the Worker runtime service account (subscriber & publisher)"
  type        = string
}

variable "labels" {
  description = "Labels to apply to topics"
  type        = map(string)
  default     = {}
}
