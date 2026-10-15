# ------------------------------------------------------------------------------
# ShopCloud Terraform GKE Module — Outputs
# ------------------------------------------------------------------------------

output "cluster_id" {
  description = "The ID of the GKE cluster, or null if dormant."
  value       = var.enable_gke && length(google_container_cluster.primary) > 0 ? google_container_cluster.primary[0].id : null
}

output "cluster_endpoint" {
  description = "The IP address of the GKE cluster master, or null if dormant."
  value       = var.enable_gke && length(google_container_cluster.primary) > 0 ? google_container_cluster.primary[0].endpoint : null
}

output "cluster_name" {
  description = "The name of the GKE cluster, or null if dormant."
  value       = var.enable_gke && length(google_container_cluster.primary) > 0 ? google_container_cluster.primary[0].name : null
}
