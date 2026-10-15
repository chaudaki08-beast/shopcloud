# ------------------------------------------------------------------------------
# ShopCloud Terraform GKE Module — Managed GKE Cluster
# ------------------------------------------------------------------------------

resource "google_container_cluster" "primary" {
  count = var.enable_gke ? 1 : 0

  name     = var.cluster_name
  location = var.region
  project  = var.project_id

  # GKE Autopilot: Google manages node provisioning, scaling, and OS hardening
  enable_autopilot = true

  network    = var.network
  subnetwork = var.subnetwork

  # Release channel for automated Kubernetes version lifecycle
  release_channel {
    channel = "REGULAR"
  }

  # Enable Workload Identity for keyless, secure GCP authentication
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  # Private Cluster Configuration
  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = false
    master_ipv4_cidr_block  = "172.16.0.0/28"
  }

  # Cost management and deletion protection
  deletion_protection = false

  resource_labels = var.labels
}
