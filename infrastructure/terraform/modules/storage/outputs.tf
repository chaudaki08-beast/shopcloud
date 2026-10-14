output "media_bucket_name" {
  description = "Name of the product media bucket"
  value       = google_storage_bucket.media_bucket.name
}

output "media_bucket_url" {
  description = "gs:// URL of the product media bucket"
  value       = google_storage_bucket.media_bucket.url
}
