# ------------------------------------------------------------------------------
# ShopCloud Terraform GKE Module — Input Variables
# ------------------------------------------------------------------------------

variable "enable_gke" {
  description = "Safety gate flag: set to true only when GKE provisioning is explicitly approved. Defaults to false to enforce zero-cost GCP spend policy."
  type        = bool
  default     = false
}

variable "project_id" {
  description = "The GCP project ID where GKE resources will be provisioned."
  type        = string
}

variable "region" {
  description = "The GCP region for the GKE cluster."
  type        = string
  default     = "asia-south1"
}

variable "cluster_name" {
  description = "The name of the GKE cluster."
  type        = string
  default     = "shopcloud-gke"
}

variable "network" {
  description = "VPC network name."
  type        = string
  default     = "default"
}

variable "subnetwork" {
  description = "VPC subnetwork name."
  type        = string
  default     = "default"
}

variable "labels" {
  description = "Common resource labels."
  type        = map(string)
  default     = {}
}
