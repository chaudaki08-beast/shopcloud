# ShopCloud — Object Storage Security & Access Control

## 1. Overview & Security Posture

In Phase 9, Google Cloud Storage was introduced to manage production media assets. Securing cloud object storage against data leaks, unauthorized mutations, malware uploads, and denial-of-wallet resource exhaustion is critical for an enterprise e-commerce platform.

This document specifies the security controls, IAM policies, validation pipelines, and threat mitigation mechanisms governing ShopCloud's object storage.

---

## 2. Least-Privilege IAM Architecture

### Service Account Principle of Least Privilege
ShopCloud adheres strictly to resource-scoped IAM roles rather than broad project-level permissions:

* **Attached Identity**: `shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com`
* **Role Granted**: `roles/storage.objectUser`
* **Resource Boundary**: Bound exclusively to `gs://shopcloud-media-24903284190`
* **Prohibited Roles**: `roles/storage.admin`, `roles/editor`, `roles/owner` are forbidden on application runtime accounts.

```bash
# Production IAM binding command executed in Phase 9
gcloud storage buckets add-iam-policy-binding gs://shopcloud-media-24903284190 \
    --member="serviceAccount:shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com" \
    --role="roles/storage.objectUser"
```

### Scope Capabilities
* ✅ `storage.objects.create` (Upload new media)
* ✅ `storage.objects.get` (Read/stream media)
* ✅ `storage.objects.delete` (Remove media upon catalog updates)
* ❌ `storage.buckets.delete` (Cannot delete or alter the bucket itself)
* ❌ `storage.buckets.setIamPolicy` (Cannot modify IAM permissions)

---

## 3. Bucket Security Hardening

### A. Public Access Prevention (PAP = Enforced)
Direct anonymous internet access to the bucket is prohibited at the Google Cloud project and bucket levels:

```
[ Anonymous Web Request ] ─── X BLOCKED (403 Access Denied) ───> gs://shopcloud-media-24903284190
```

* Prevents accidental exposure of media files via legacy public ACLs (e.g. `allUsers:roles/storage.objectViewer`).
* All media retrieval is mediated by the authenticated Cloud Run API Gateway or cryptographically signed time-limited URLs.

### B. Uniform Bucket-Level Access (UBLA)
* Uniform Bucket-Level Access is **ENABLED**.
* Disables legacy per-object Access Control Lists (ACLs), ensuring all access decisions are audited and enforced strictly via Google Cloud IAM.

---

## 4. Input Validation & Content Security

Allowing arbitrary file uploads creates vectors for server-side execution, XSS, and storage exhaustion. ShopCloud implements defense-in-depth file sanitization:

### 1. Multi-tier MIME & Extension Whitelisting
Only three standard web image formats are permitted:
* `image/jpeg` (`.jpg`)
* `image/png` (`.png`)
* `image/webp` (`.webp`)

Executable formats (`.exe`, `.sh`, `.php`), SVG (`image/svg+xml` - XSS vector), and general binaries are rejected with `400 Bad Request`.

### 2. Binary Magic Byte Verification
Client-supplied `Content-Type` headers and file extensions can be trivially spoofed. The `StorageService` verifies the true binary signature of every incoming upload buffer before passing it to GCS:

| MIME Type | Expected Header Signature | Validation Rule |
| :--- | :--- | :--- |
| `image/jpeg` | `FF D8 FF` | First 3 bytes match `0xFF 0xD8 0xFF` |
| `image/png` | `89 50 4E 47 0D 0A 1A 0A` | First 8 bytes match standard PNG magic header |
| `image/webp` | `RIFF....WEBP` | Bytes 0..3 equal `RIFF`, bytes 8..11 equal `WEBP` |

Spoofed files (e.g., PHP or script files renamed to `.jpg`) trigger immediate rejection:
`File content does not match reported MIME type. Magic byte validation failed.`

### 3. File Size Caps
Upload payload size is restricted to a maximum of **5 MB** (`5 * 1024 * 1024` bytes) through NestJS Multer configuration. Requests exceeding this threshold fail prior to buffer allocation.

### 4. Path Traversal & Injection Prevention
* User-controlled filenames (`file.originalname`) are **never** used in GCS object keys.
* The product identifier is sanitized via regex `productId.replace(/[^a-zA-Z0-9_-]/g, '')`.
* The object filename is generated as a secure, collision-free UUID v4.

---

## 5. Role-Based Access Control (RBAC) Governance

Upload and deletion endpoints are strictly shielded by NestJS JWT Authentication and RBAC Guards:

| Operation | Anonymous | Customer | Staff / Admin |
| :--- | :--- | :--- | :--- |
| **Stream Image Binary** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Get Image Metadata** | ✅ Allowed | ✅ Allowed | ✅ Allowed |
| **Upload Product Image** | ❌ 401 Unauthorized | ❌ 403 Forbidden | ✅ Allowed (`SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER`) |
| **Set Primary Image** | ❌ 401 Unauthorized | ❌ 403 Forbidden | ✅ Allowed (`SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER`) |
| **Delete Product Image** | ❌ 401 Unauthorized | ❌ 403 Forbidden | ✅ Allowed (`SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER`) |

---

## 6. Orphan Object Lifecycle Governance

When a product or product image is deleted from the catalog:
1. An atomic database operation removes the metadata record from PostgreSQL.
2. The `StorageService` issues a deletion request to GCS for the associated `storageKey`.
3. An automated GCS Lifecycle Rule automatically purges incomplete multi-part uploads older than **7 days**, guarding against lingering orphaned chunks and billing leakage.
