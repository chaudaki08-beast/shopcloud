variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "region" {
  description = "The region for user-managed secret replication"
  type        = string
  default     = "asia-south1"
}

variable "api_sa_email" {
  description = "Email of the API runtime service account"
  type        = string
}

variable "worker_sa_email" {
  description = "Email of the Worker runtime service account"
  type        = string
}

variable "labels" {
  description = "Labels to apply to secrets"
  type        = map(string)
  default     = {}
}
