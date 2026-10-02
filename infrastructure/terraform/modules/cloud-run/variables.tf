variable "project_name" {
  type    = string
  default = "shopcloud"
}

variable "environment" {
  type = string
}

variable "region" {
  type    = string
  default = "asia-south1"
}

variable "container_image" {
  type = string
}

variable "service_account_email" {
  type = string
}

variable "database_url" {
  type      = string
  sensitive = true
}

variable "vpc_connector_id" {
  type = string
}

variable "min_instances" {
  type    = number
  default = 0
}

variable "max_instances" {
  type    = number
  default = 10
}
