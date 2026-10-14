# ShopCloud Terraform Operations & Rollback Guide

## 1. Day-to-Day Terraform Workflow

Infrastructure modifications in ShopCloud follow a disciplined, testable, and reviewed operational workflow:

```
  ┌──────────────────┐
  │ Local Dev Branch │
  │ Edit *.tf config │
  └────────┬─────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Local Verification                                      │
  │ - terraform fmt -check -recursive                       │
  │ - terraform validate                                    │
  │ - trivy config infrastructure/terraform                 │
  └────────┬────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Pull Request to develop / main                          │
  │ - GitHub Actions CI executes automated Terraform checks │
  │ - Peer review of infrastructure diff                    │
  └────────┬────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Controlled Plan Generation                              │
  │ - terraform plan -out=tfplan                            │
  │ - Human inspection of resource additions/changes/drops  │
  └────────┬────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ EXPLICIT HUMAN APPROVAL GATE                            │
  │ (Apply is executed only after affirmative approval)     │
  └────────┬────────────────────────────────────────────────┘
           │
           ▼
  ┌─────────────────────────────────────────────────────────┐
  │ Controlled Apply & Post-Flight Health Verification      │
  │ - terraform apply tfplan                                │
  │ - Verify Cloud SQL activationPolicy remains NEVER       │
  │ - Verify Cloud Run revisions return 200 OK              │
  └─────────────────────────────────────────────────────────┘
```

---

## 2. Standard Command Reference

Run all commands from `infrastructure/terraform/environments/dev`:

### Code Formatting
Ensure all `.tf` files adhere to canonical Terraform style:
```bash
terraform fmt -recursive infrastructure/terraform
```

### Static Syntax & Reference Validation
Validate module syntax, references, and provider constraints:
```bash
terraform init -backend=false
terraform validate
```

### Dry-Run Execution Plan
Generate an immutable binary plan file for review:
```bash
terraform plan -out=tfplan
```
To inspect the generated plan in human-readable text:
```bash
terraform show tfplan
```

### Controlled Execution
Apply only the reviewed binary plan file:
```bash
terraform apply tfplan
```

---

## 3. Mandatory Approval Gate Policy

1. **No Automated Apply**: CI pipelines must NEVER run `terraform apply`. Terraform execution is strictly gated by manual approval.
2. **Review Checklist Prior to Approval**:
   - [ ] Confirm no billable resources are introduced unexpectedly.
   - [ ] Confirm `google_sql_database_instance.postgres.settings.activation_policy` is `"NEVER"`.
   - [ ] Confirm no VPC Access Connector (`google_vpc_access_connector`) is being created.
   - [ ] Confirm Cloud Run `scaling.min_instance_count` is `0` (scale-to-zero).
   - [ ] Confirm no secrets or credentials appear in the plan output.
   - [ ] Confirm no existing production database or storage bucket is marked for destruction (`- destroy`).

---

## 4. Drift Detection Runbook

To identify configuration drift between the declarative Terraform code and live GCP infrastructure:

```bash
cd infrastructure/terraform/environments/dev
terraform plan -detailed-exitcode -no-color
```

### Exit Codes:
- **`0`**: Succeeded, diff is empty (no drift detected; infrastructure matches code perfectly).
- **`1`**: Errored (credentials issue, network failure, or syntax error).
- **`2`**: Succeeded, differences detected (infrastructure has drifted from code).

If drift is detected:
1. Review the output of `terraform plan` to identify which attributes or resources diverged.
2. Determine if the drift represents an intentional out-of-band operational change (e.g., Cloud Run new container image deployed by CI/CD) or unintentional configuration skew.
3. If intentional (e.g. new container tag), update `environments/dev/terraform.tfvars` or module variables to match the desired state.
4. If unintentional, re-apply the canonical Terraform plan to reconcile live infrastructure back to code.

---

## 5. Rollback Runbooks

### Scenario A: Reverting an Unwanted Configuration Change
1. Revert the commit in Git:
   ```bash
   git revert <commit-sha>
   ```
2. Generate a corrective execution plan:
   ```bash
   terraform plan -out=revert.plan
   ```
3. Inspect and apply the plan to restore the previous state:
   ```bash
   terraform apply revert.plan
   ```

### Scenario B: Restoring Terraform State from Backup
If a state operation corrupts local or remote state:
1. Locate the latest verified backup:
   - For local state: `terraform.tfstate.backup` or timestamped backup file.
   - For GCS remote state: list object versions in Cloud Storage:
     ```bash
     gcloud storage objects list --versions gs://shopcloud-tfstate-24903284190/terraform/state/dev/
     ```
2. Download the desired state version:
   ```bash
   gcloud storage cp gs://shopcloud-tfstate-24903284190/terraform/state/dev/default.tstate#<GENERATION> ./restored.tfstate
   ```
3. Push restored state to backend:
   ```bash
   terraform state push ./restored.tfstate
   ```

### Scenario C: Emergency Cloud Run Revision Rollback
If an infrastructure or container update impairs Cloud Run service health:
```bash
# Roll back API service to previous revision
gcloud run services update-traffic shopcloud-api \
  --project=project-c3f386b1-6c37-468d-8ee \
  --region=asia-south1 \
  --to-revisions=shopcloud-api-00008-cd5=100

# Roll back Web service to previous revision
gcloud run services update-traffic shopcloud-web \
  --project=project-c3f386b1-6c37-468d-8ee \
  --region=asia-south1 \
  --to-revisions=shopcloud-web-00002-5ck=100
```

### Scenario D: Cloud SQL Emergency State Verification
If any operation inadvertently attempts to start Cloud SQL, immediately force `NEVER`:
```bash
gcloud sql instances patch shopcloud-postgres \
  --project=project-c3f386b1-6c37-468d-8ee \
  --activation-policy=NEVER
```

---

## 6. Coordination Between Terraform, Prisma Migrations & Application CD

ShopCloud maintains a clear boundary between platform infrastructure, schema migrations, and application code delivery:

| Domain | Responsible Tool / Pipeline | Execution Trigger | Overlap Avoidance Strategy |
| :--- | :--- | :--- | :--- |
| **Cloud Infrastructure** | HashiCorp Terraform | Manual PR & human approval | Terraform provisions Cloud SQL instances, databases, service accounts, and Pub/Sub topics. It does NOT manage database tables, seeds, or application builds. |
| **Database Schema** | Prisma (`prisma migrate deploy`) | Explicit maintenance window | Prisma operates within the database instance created by Terraform. Migrations run as controlled scripts during planned windows when Cloud SQL is started temporarily. |
| **Application Delivery** | GitHub Actions (`deploy.yml`) | Push to `main` branch | CI/CD updates Cloud Run container image revisions directly using Google Cloud WIF and `google-github-actions/deploy-cloudrun`. Cloud Run module in Terraform defines base infrastructure; application image updates flow through CD. |
