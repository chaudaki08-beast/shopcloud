# ShopCloud — Production Database Operations & Migration Guide

## 1. Production Migration Governance

ShopCloud employs an immutable, version-controlled migration lifecycle managed through **Prisma Migrate**.

### Core Rule: Zero `prisma db push` in Production
- `prisma db push` is strictly prohibited against any production or staging environment.
- Only deterministic, code-reviewed migrations executed via `prisma migrate deploy` are permitted.
- The `_prisma_migrations` table in Cloud SQL acts as the authoritative state ledger.

---

## 2. Migration Deployment Procedure

To deploy migrations against Google Cloud SQL:

### Step 1: Establish Secure IAM Proxy Connection
Ensure Google Cloud SDK is authenticated with appropriate project permissions, then start Cloud SQL Auth Proxy:
```bash
cloud-sql-proxy project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres --port 5434 -g
```

### Step 2: Validate Migration Status
Inspect pending migrations without modifying state:
```bash
DATABASE_URL="postgresql://shopcloud_app:***@127.0.0.1:5434/shopcloud" npx prisma migrate status --schema=packages/database/prisma/schema.prisma
```

### Step 3: Deploy Migrations
Apply unapplied migrations sequentially:
```bash
DATABASE_URL="postgresql://shopcloud_app:***@127.0.0.1:5434/shopcloud" npx prisma migrate deploy --schema=packages/database/prisma/schema.prisma
```

---

## 3. Migration History Log

| Migration Name | Applied Timestamp | Description |
| :--- | :--- | :--- |
| `20261003090131_init_shopcloud_schema` | `2026-10-05 08:22:27 UTC` | Baseline schema: User, Product, Category, Order, Cart, Payment, Shipment, AuditLog |
| `20261003120541_add_auth_rbac_and_refresh_tokens` | `2026-10-05 08:22:28 UTC` | RefreshToken rotation, Permission, and RolePermission matrices |
| `20261004085326_add_auth_rate_limits` | `2026-10-05 08:22:28 UTC` | Distributed IP/route authentication rate-limiting table |
| `20261005102731_add_product_image_storage_metadata` | `2026-10-05 10:30:15 UTC` | ProductImage storageKey, mimeType, and fileSize fields with index |

**Verification Status**: `Database schema is up to date!` (Zero pending migrations).

---

## 4. Production Database Seeding Strategy

### A. Separation of Concerns
| Environment | Script | Content | Credentials Policy |
| :--- | :--- | :--- | :--- |
| **Development / Local** | `src/seed.ts` | Demo catalog + dev test accounts (`admin@shopcloud.dev`, `Password123!`) | Known dev password hashes |
| **Production** | `src/seed-prod.ts` | Official Categories, Products, Images, Coupons, RBAC matrices | **STRICTLY ZERO** default passwords |

### B. Safe Production Seed Execution
The production seed script (`npm run db:seed:prod`) is idempotent and safe to run multiple times:
- Uses `prisma.category.upsert()` by unique slug.
- Uses `prisma.product.upsert()` by unique slug.
- Uses `prisma.permission.upsert()` and `prisma.rolePermission.upsert()` to guarantee complete RBAC coverage.
- If an admin user is desired, it is provisioned ONLY if `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD_HASH` are explicitly supplied in the environment.

---

## 5. Transaction Safety & Business Invariants

ShopCloud e-commerce transactions rely on PostgreSQL ACID guarantees executed inside Prisma `$transaction`:

```typescript
const order = await prisma.$transaction(async (tx) => {
  // 1. Atomically check and decrement stock
  // 2. Insert InventoryMovement audit record (ORDER_RESERVED)
  // 3. Create Order and OrderItem records
  // 4. Record initial Order status transition audit
  // 5. Atomically clear user CartItem records
});
```

### Verified Failure Modes:
- **Stock Exhaustion / Business Logic Failure**: Entire transaction rolls back immediately; inventory remains untouched.
- **Foreign Key Violation**: PostgreSQL rejects orphaned items with error `P2003`.
- **Unique Constraint Violation**: Duplicate emails or slugs are rejected with error `P2002`.

---

## 6. Runtime Health & Diagnostic Monitoring

Cloud Run continuously probes PostgreSQL connectivity via `/api/v1/health`:

```json
{
  "status": "healthy",
  "services": {
    "api": {
      "status": "healthy",
      "message": "Serving requests"
    },
    "database": {
      "status": "healthy",
      "latencyMs": 7,
      "message": "PostgreSQL reachable"
    }
  }
}
```

The health check executes a live query (`SELECT 1`) to ensure the Unix domain socket is active and responsive. Query latency typically averages between **5ms and 15ms** within `asia-south1`.
