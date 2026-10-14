variable "project_id" {
  description = "The Google Cloud Project ID."
  type        = string
}

variable "environment" {
  description = "Deployment environment name (e.g. dev, prod)."
  type        = string
  default     = "dev"
}

variable "api_service_name" {
  description = "Name of the Cloud Run API service."
  type        = string
  default     = "shopcloud-api"
}

variable "web_service_name" {
  description = "Name of the Cloud Run Web service."
  type        = string
  default     = "shopcloud-web"
}

variable "inventory_subscription_id" {
  description = "Pub/Sub subscription ID for the inventory worker."
  type        = string
  default     = "shopcloud-inventory-sub"
}

variable "notification_subscription_id" {
  description = "Pub/Sub subscription ID for the notification worker."
  type        = string
  default     = "shopcloud-notification-sub"
}

variable "inventory_dlq_subscription_id" {
  description = "Pub/Sub dead-letter subscription ID for inventory worker."
  type        = string
  default     = "shopcloud-inventory-dlq-sub"
}

variable "notification_dlq_subscription_id" {
  description = "Pub/Sub dead-letter subscription ID for notification worker."
  type        = string
  default     = "shopcloud-notification-dlq-sub"
}

variable "cloud_sql_instance_name" {
  description = "Cloud SQL database instance name."
  type        = string
  default     = "shopcloud-postgres"
}

variable "notification_channels" {
  description = "List of Google Cloud Monitoring notification channel IDs (e.g. email, Slack)."
  type        = list(string)
  default     = []
}
