terraform {
  required_version = ">= 1.5.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

module "networking" {
  source       = "../../modules/networking"
  project_name = var.project_name
  environment  = var.environment
  region       = var.region
}

module "iam" {
  source       = "../../modules/iam"
  project_id   = var.project_id
  project_name = var.project_name
  environment  = var.environment
}

module "storage" {
  source       = "../../modules/storage"
  project_name = var.project_name
  environment  = var.environment
  region       = var.region
}

module "pubsub" {
  source       = "../../modules/pubsub"
  project_name = var.project_name
  environment  = var.environment
}

module "cloud_sql" {
  source                    = "../../modules/cloud-sql"
  project_name              = var.project_name
  environment               = var.environment
  region                    = var.region
  network_id                = module.networking.network_id
  vpc_connection_dependency = module.networking.network_id
  db_password               = var.db_password
}

module "cloud_run" {
  source                = "../../modules/cloud-run"
  project_name          = var.project_name
  environment           = var.environment
  region                = var.region
  container_image       = var.api_container_image
  service_account_email = module.iam.api_service_account_email
  database_url          = "postgresql://shopcloud_app:${var.db_password}@${module.cloud_sql.private_ip_address}:5432/shopcloud?schema=public"
  vpc_connector_id      = module.networking.vpc_connector_id
}

module "monitoring" {
  source      = "../../modules/monitoring"
  alert_email = var.alert_email
}
