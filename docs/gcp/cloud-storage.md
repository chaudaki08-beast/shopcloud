# ShopCloud — Google Cloud Storage Architecture & Specification

## 1. Overview & Objective

Phase 9 establishes **Google Cloud Storage (GCS)** as the durable, highly available object storage foundation for ShopCloud.

Prior to Phase 9, product images were referenced via transient mock URLs or stored on ephemeral local filesystems. This phase transitions all media management to a dedicated, production-grade GCS bucket in `asia-south1` (Mumbai), tightly integrated with the NestJS API gateway, Cloud Run runtime, Prisma ORM, and Cloud SQL.

---

## 2. Infrastructure Architecture & Data Flow

```
[ Customer / Admin Client ]
        │
        │ 1. Multipart Form Upload (JPEG/PNG/WEBP, <= 5MB)
        ▼
┌────────────────────────────────────────────────────────┐
│ Cloud Run: shopcloud-api (revision 00007-nxs)          │
│  - Runtime SA: shopcloud-api-runtime                   │
│  - Multer MemoryStorage stream buffer                  │
│  - StorageService: MIME & Magic Byte Validation        │
│  - Deterministic Key Generation:                       │
│    products/{productId}/{uuid}.{ext}                   │
└──────────┬───────────────────────────┬─────────────────┘
           │                           │
           │ 2. Save Object Stream     │ 3. Save Image Metadata
           │    (roles/storage.objectUser) (storageKey, mimeType, fileSize)
           ▼                           ▼
┌──────────────────────────────┐ ┌─────────────────────────────────┐
│ Google Cloud Storage (GCS)   │ │ Google Cloud SQL (PostgreSQL 16) │
│  - Bucket:                   │ │  - Table: ProductImage           │
│    shopcloud-media-24903284190│ │  - storageKey, mimeType,        │
│  - Region: asia-south1       │ │    fileSize, isPrimary, altText  │
│  - Class: STANDARD           │ └─────────────────────────────────┘
│  - Access: Uniform (Enforced)│
│  - PAP: Enforced (No Public) │
└──────────────────────────────┘
```

### Media Retrieval Flows

ShopCloud supports two secure access patterns for object assets:

1. **Proxy Streaming (`/api/v1/products/:id/images/:imageId/file`)**:
   - The Cloud Run API streams the object directly from GCS to the client with appropriate `Content-Type` and `Cache-Control` headers.
   - Ideal for low-latency, zero-configuration internal or external display without exposing bucket endpoints.
2. **V4 Signed URLs (`/api/v1/products/:id/images/:imageId/signed-url`)**:
   - Generates a short-lived (15-minute) cryptographic Google Cloud V4 signed URL for direct GCS reads where service account signing credentials are provided.
   - Gracefully falls back to the high-performance proxy streaming endpoint in compute environments lacking blob signing permissions.

---

## 3. Cloud Storage Bucket Specification

| Parameter | Value | Rationale / Production Context |
| :--- | :--- | :--- |
| **Bucket Name** | `shopcloud-media-24903284190` | Globally unique name parameterized by GCP project number |
| **Storage Class** | `STANDARD` | Lowest access latency for active e-commerce storefront assets |
| **Location / Region** | `asia-south1` (Mumbai) | Co-located with Cloud Run and Cloud SQL for sub-10ms latency |
| **Uniform Bucket-Level Access** | `Enabled` | Enforces unified Cloud IAM policies; disables legacy ACLs |
| **Public Access Prevention** | `enforced` | Guarantees zero public internet exposure at bucket level |
| **Lifecycle Policy** | `AbortIncompleteMultipartUpload: 7d` | Prevents billing accumulation from interrupted multi-part uploads |
| **Versioning** | `Disabled` | Prevents unnecessary storage costs for replaceable product media |

---

## 4. Object Organization & Deterministic Naming

Objects are partitioned logically by domain entity and unique identifier to prevent collisions and ensure zero directory hotspots:

```
gs://shopcloud-media-24903284190/
└── products/
    └── {productId}/
        ├── 17859b9a-9a9c-4ee0-b549-e4c33cc7552a.jpg
        └── c3b91a7e-41df-4b92-91f8-002d41a79ef1.webp
```

* **Sanitization**: Product ID is strictly sanitized to alphanumeric characters, dashes, and underscores to eliminate path traversal risks.
* **UUID Isolation**: Each file receives a freshly generated `crypto.randomUUID()` filename.
* **Extension Normalization**: Extensions are derived from validated MIME types (`.jpg`, `.png`, `.webp`), not client-supplied filenames.

---

## 5. StorageService Implementation

The NestJS backend encapsulates all object storage operations in `StorageService` (`apps/api/src/modules/storage/storage.service.ts`):

* **SDK**: Utilizes the official `@google-cloud/storage` SDK.
* **Authentication**: Seamless Google Application Default Credentials (ADC) via the attached Cloud Run service account `shopcloud-api-runtime`.
* **Validation Engine**:
  - Maximum upload size: **5 MB**.
  - Whitelisted MIME types: `image/jpeg`, `image/png`, `image/webp`.
  - **Magic Byte Inspection**: Verifies binary headers against spoofed extensions (e.g. `FF D8 FF` for JPEG, `89 50 4E 47` for PNG, `RIFF...WEBP` for WEBP).
* **Test & Local Fallback**: Automatically activates an in-memory buffer store when offline or executing Jest unit test runners (`process.env.JEST_WORKER_ID` or `process.env.NODE_ENV === 'test'`), guaranteeing 100% deterministic test execution without cloud dependencies.

---

## 6. Product Image REST API Endpoints

All endpoints are mounted under `/api/v1/products/:id/images`:

| HTTP Method | Endpoint | RBAC Guard | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/:id/images` | `SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER` | Uploads multipart image, validates magic bytes, writes to GCS, and records metadata in PostgreSQL |
| `GET` | `/:id/images` | Public | Lists all image metadata and accessible URLs for the product |
| `GET` | `/:id/images/:imageId` | Public | Retrieves specific image metadata record |
| `GET` | `/:id/images/:imageId/file` | Public | Streams the raw binary image with correct `Content-Type` and cache headers |
| `GET` | `/:id/images/:imageId/signed-url` | Public | Generates a time-limited signed URL (or stream fallback) for direct retrieval |
| `PATCH` | `/:id/images/:imageId/primary` | `SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER` | Atomically sets target image as primary, resetting siblings in an ACID transaction |
| `DELETE` | `/:id/images/:imageId` | `SUPER_ADMIN`, `STORE_ADMIN`, `INVENTORY_MANAGER` | Deletes image record from database and removes object from GCS bucket |

---

## 7. Database Metadata Integration

Prisma schema `ProductImage` model was extended with storage attributes:

```prisma
model ProductImage {
  id         String   @id @default(uuid())
  productId  String
  url        String
  altText    String?
  isPrimary  Boolean  @default(false)
  storageKey String?
  mimeType   String?
  fileSize   Int?
  createdAt  DateTime @default(now())
  product    Product  @relation(fields: [productId], references: [id], onDelete: Cascade)

  @@index([productId])
  @@index([storageKey])
}
```

Migration applied to Cloud SQL: `20261005102731_add_product_image_storage_metadata`.
