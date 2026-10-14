variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
  default     = "project-c3f386b1-6c37-468d-8ee"
}

variable "project_number" {
  description = "The Google Cloud Project Number"
  type        = string
  default     = "24903284190"
}

variable "project_name" {
  description = "The application project name"
  type        = string
  default     = "shopcloud"
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)"
  type        = string
  default     = "dev"
}

variable "region" {
  description = "The primary Google Cloud region"
  type        = string
  default     = "asia-south1"
}

variable "zone" {
  description = "The primary Google Cloud zone"
  type        = string
  default     = "asia-south1-c"
}

variable "github_repository_id" {
  description = "Numeric GitHub repository ID for OIDC WIF condition"
  type        = string
  default     = "1401646031"
}

variable "github_repository_owner_id" {
  description = "Numeric GitHub repository owner ID for OIDC WIF condition"
  type        = string
  default     = "292493253"
}

variable "monitoring_notification_channels" {
  description = "List of Google Cloud Monitoring notification channel IDs (e.g. email, Slack)"
  type        = list(string)
  default     = []
}

