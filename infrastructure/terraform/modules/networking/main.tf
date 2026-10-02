resource "google_compute_network" "vpc_network" {
  name                    = "${var.project_name}-${var.environment}-vpc"
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "subnet" {
  name          = "${var.project_name}-${var.environment}-subnet"
  ip_cidr_range = var.subnet_cidr
  region        = var.region
  network       = google_compute_network.vpc_network.id
}

# Private IP allocation for Cloud SQL (Service Networking)
resource "google_compute_global_address" "private_ip_address" {
  name          = "${var.project_name}-${var.environment}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc_network.id
}

resource "google_service_networking_connection" "private_vpc_connection" {
  network                 = google_compute_network.vpc_network.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_ip_address.name]
}

# Serverless VPC Access Connector for Cloud Run -> Private Cloud SQL
resource "google_vpc_access_connector" "connector" {
  name          = "vpc-conn-${var.environment}"
  region        = var.region
  ip_cidr_range = var.connector_cidr
  network       = google_compute_network.vpc_network.name
}

output "network_id" {
  value = google_compute_network.vpc_network.id
}

output "vpc_connector_id" {
  value = google_vpc_access_connector.connector.id
}
