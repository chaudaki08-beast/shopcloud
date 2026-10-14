terraform {
  required_version = ">= 1.5.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.30"
    }
  }

  # ------------------------------------------------------------------------------
  # Remote Backend Strategy (Approval-Gated for Zero Cost)
  # Un-comment the block below once a dedicated state bucket has been approved
  # and provisioned (e.g. gs://shopcloud-terraform-state-24903284190).
  # ------------------------------------------------------------------------------
  # backend "gcs" {
  #   bucket = "shopcloud-terraform-state-24903284190"
  #   prefix = "terraform/state/dev"
  # }
}
