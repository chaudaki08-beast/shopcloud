variable "project_id" {
  description = "The Google Cloud Project ID"
  type        = string
}

variable "bucket_name" {
  description = "The globally unique GCS bucket name for product media"
  type        = string
  default     = "shopcloud-media-24903284190"
}

variable "location" {
  description = "Bucket geographic location"
  type        = string
  default     = "ASIA-SOUTH1"
}

variable "storage_class" {
  description = "Default storage class"
  type        = string
  default     = "STANDARD"
}

variable "api_sa_email" {
  description = "Email of the API runtime service account for object access"
  type        = string
}

variable "labels" {
  description = "Labels to apply to the bucket"
  type        = map(string)
  default     = {}
}
