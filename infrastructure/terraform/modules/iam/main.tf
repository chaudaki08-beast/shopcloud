# ------------------------------------------------------------------------------
# ShopCloud IAM & Workload Identity Federation Module
# Enforces least-privilege service account isolation and keyless GitHub Actions auth
# ------------------------------------------------------------------------------

# 1. Workload Runtime Service Accounts
resource "google_service_account" "api_runtime" {
  account_id   = "shopcloud-api-runtime"
  display_name = "ShopCloud API runtime (dev)"
  description  = "Cloud Run API runtime identity. Phase 6: no roles; grants added per-resource in Phases 7-10."
  project      = var.project_id
}

resource "google_service_account" "web_runtime" {
  account_id   = "shopcloud-web-runtime"
  display_name = "ShopCloud web runtime (dev)"
  description  = "Cloud Run web (nginx) runtime identity. No roles: serves static files and proxies /api over public HTTPS."
  project      = var.project_id
}

resource "google_service_account" "worker_runtime" {
  account_id   = "shopcloud-worker-runtime"
  display_name = "ShopCloud worker runtime (dev)"
  description  = "Cloud Run worker runtime identity. Phase 6: no roles; grants added per-resource in Phases 7-10."
  project      = var.project_id
}

resource "google_service_account" "github_deployer" {
  account_id   = "shopcloud-github-deployer"
  display_name = "ShopCloud GitHub Actions deployer (dev)"
  description  = "Impersonated only via Workload Identity Federation from chaudaki08-beast/shopcloud. No JSON keys."
  project      = var.project_id
}

# 2. Workload Identity Federation (WIF) Pool & Provider
resource "google_iam_workload_identity_pool" "github_pool" {
  workload_identity_pool_id = "shopcloud-github-pool"
  display_name              = "ShopCloud GitHub Actions"
  description               = "OIDC federation for GitHub Actions in chaudaki08-beast/shopcloud only"
  disabled                  = false
  project                   = var.project_id
}

resource "google_iam_workload_identity_pool_provider" "github_actions" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github_pool.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-actions"
  display_name                       = "GitHub Actions OIDC"
  project                            = var.project_id

  attribute_condition = "assertion.repository_id == '${var.github_repository_id}' && assertion.repository_owner_id == '${var.github_repository_owner_id}'"

  attribute_mapping = {
    "google.subject"                = "assertion.sub"
    "attribute.actor"               = "assertion.actor"
    "attribute.ref"                 = "assertion.ref"
    "attribute.repository"          = "assertion.repository"
    "attribute.repository_id"       = "assertion.repository_id"
    "attribute.repository_owner_id" = "assertion.repository_owner_id"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# 3. WIF Impersonation Binding for GitHub Deployer
resource "google_service_account_iam_member" "deployer_wif" {
  service_account_id = google_service_account.github_deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github_pool.name}/attribute.repository_id/${var.github_repository_id}"
}

# 4. Deployer Authorizations on Runtime Service Accounts
resource "google_service_account_iam_member" "deployer_actas_api" {
  service_account_id = google_service_account.api_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}

resource "google_service_account_iam_member" "deployer_actas_web" {
  service_account_id = google_service_account.web_runtime.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_deployer.email}"
}
