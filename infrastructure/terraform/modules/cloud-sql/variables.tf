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

variable "tier" {
  type    = string
  default = "db-f1-micro"
}

variable "network_id" {
  type = string
}

variable "vpc_connection_dependency" {
  type    = any
  default = null
}

variable "database_name" {
  type    = string
  default = "shopcloud"
}

variable "db_user" {
  type    = string
  default = "shopcloud_app"
}

variable "db_password" {
  type      = string
  sensitive = true
}
