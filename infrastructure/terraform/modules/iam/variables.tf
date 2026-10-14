variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "github_repository_id" {
  description = "The numeric GitHub repository ID for OIDC condition binding"
  type        = string
  default     = "1401646031"
}

variable "github_repository_owner_id" {
  description = "The numeric GitHub repository owner ID for OIDC condition binding"
  type        = string
  default     = "292493253"
}
