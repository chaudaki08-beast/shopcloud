locals {
  common_labels = {
    project     = var.project_name
    environment = var.environment
    owner       = "shopcloud"
    managed-by  = "terraform"
  }
}
