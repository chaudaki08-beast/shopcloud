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

variable "subnet_cidr" {
  type    = string
  default = "10.0.0.0/20"
}

variable "connector_cidr" {
  type    = string
  default = "10.8.0.0/28"
}
