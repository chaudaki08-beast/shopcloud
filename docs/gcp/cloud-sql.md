# ShopCloud — Google Cloud SQL Architecture & Specification

## 1. Overview & Objective

Phase 8 elevates ShopCloud from transient local SQLite/container development storage to a fully managed, enterprise-grade **Google Cloud SQL PostgreSQL 16** database.

This document establishes the production database specifications, security boundaries, networking topology, connection lifecycle, and backup governance for the ShopCloud platform.

---

## 2. Infrastructure Architecture

```
[ Internet Traffic ]
        │ HTTPS (443)
        ▼
┌────────────────────────────────────────────────────────┐
│ Cloud Run Service: shopcloud-api                       │
│  - Runtime SA: shopcloud-api-runtime                   │
│  - Secret Manager: shopcloud-dev-database-url:latest   │
│  - Local Unix Domain Socket mount:                     │
│    /cloudsql/project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres │
└──────────────────────────┬─────────────────────────────┘
                           │ Authenticated Unix Domain Socket
                           │ (roles/cloudsql.client)
                           ▼
┌────────────────────────────────────────────────────────┐
│ Google Cloud SQL: shopcloud-postgres                   │
│  - PostgreSQL 16 (Enterprise Edition)                  │
│  - Tier: db-custom-1-3840 (1 vCPU, 3.75 GB RAM)        │
│  - Region: asia-south1-c (Mumbai)                      │
│  - Database: shopcloud                                 │
│  - Application User: shopcloud_app                     │
│  - Authorized Networks: NONE (Public IP blocked)       │
└────────────────────────────────────────────────────────┘
```

---

## 3. Cloud SQL Instance Specifications

| Parameter | Configuration | Rationale / Production Context |
| :--- | :--- | :--- |
| **Instance ID** | `shopcloud-postgres` | Deterministic naming convention for the project |
| **Database Engine** | `POSTGRES_16` | Matches local engine; compatible with Prisma 5.19.1 |
| **Edition** | `ENTERPRISE` | Cloud SQL Enterprise Edition standard tier |
| **Machine Tier** | `db-custom-1-3840` | 1 vCPU, 3840 MiB RAM; stable dedicated vCPU tier |
| **Region / Zone** | `asia-south1-c` | Low-latency co-location with Cloud Run in Mumbai |
| **Storage Type** | `SSD` | Low latency IOPS for transactional e-commerce workloads |
| **Storage Size** | `10 GB` | Initial cost-conscious size; minimum Cloud SQL SSD |
| **Storage Auto-increase** | `Enabled` | Automatically prevents out-of-disk downtime |
| **Availability Type** | `ZONAL` | Single-zone deployment; cost-optimized for portfolio |
| **Deletion Protection** | `Enabled` | Guards against accidental instance deletion via CLI/Console |

---

## 4. Network & Connectivity Security

### A. Zero Direct Internet Exposure
Direct raw TCP exposure from public IP ranges is strictly prohibited:
- `--authorized-networks=""` (no public CIDR allowed).
- Direct external attempts to connect to `34.100.247.140:5432` are rejected by GCP firewall.

### B. Cloud Run Native Integration
Cloud Run communicates with Cloud SQL through the Google Cloud SQL proxy sidecar injected by Cloud Run when `--add-cloudsql-instances` is configured:
- Socket path: `/cloudsql/project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres`
- Mutual TLS and IAM authentication are handled automatically by the Cloud Run runtime.

### C. Local / CI Administration Connectivity
For schema migrations and administrative maintenance, access is mediated via the **Cloud SQL Auth Proxy v2**:
```bash
cloud-sql-proxy project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres --port 5434 -g
```
- Listens strictly on `127.0.0.1:5434`.
- Authenticates using short-lived IAM credentials (`gcloud auth`).
- Zero static IP whitelisting needed.

---

## 5. IAM & Least-Privilege Identity

### A. Cloud Run Runtime Identity
- **Service Account**: `shopcloud-api-runtime@project-c3f386b1-6c37-468d-8ee.iam.gserviceaccount.com`
- **Assigned Role**: `roles/cloudsql.client`
- **Secret Access**: `roles/secretmanager.secretAccessor` on `shopcloud-dev-database-url`

### B. Unprivileged Services
- `shopcloud-web` has **ZERO** Cloud SQL roles, secrets, or connections.
- Cloud Run workers only receive permissions when event processing is introduced.

---

## 6. Secret Manager & Connection URL Format

All database connection strings are managed exclusively in **Google Secret Manager**:
- **Secret Name**: `shopcloud-dev-database-url`
- **Mount Mechanism**: Cloud Run container environment variable `DATABASE_URL` via `secretKeyRef`

### Secret URL Format (Sensitive credentials hidden):
```
postgresql://shopcloud_app:<ENCRYPTED_SECRET>@localhost/shopcloud?host=/cloudsql/project-c3f386b1-6c37-468d-8ee:asia-south1:shopcloud-postgres&connection_limit=10&pool_timeout=20
```

> [!CAUTION]
> Never log, commit, or print the raw `DATABASE_URL` or database passwords. All passwords are generated using cryptographically secure random bytes and committed exclusively to Secret Manager.

---

## 7. Connection Management & Scalability Limits

Cloud Run autoscaling requires strict connection budget management:

| Dimension | Value | Notes |
| :--- | :--- | :--- |
| **Cloud SQL Max Connections** | ~100 | PostgreSQL engine default for 3.84 GB RAM |
| **Cloud Run Max Scale** | `2` instances | Knative autoscaling concurrency limit |
| **Prisma Pool Size** | `10` | Set via `connection_limit=10` query parameter |
| **Maximum Total Connections** | `20` | 2 instances × 10 connections = 20% of server capacity |
| **Pool Timeout** | `20` seconds | Set via `pool_timeout=20` query parameter |

This architecture guarantees that even under sudden Cloud Run traffic spikes and container spin-ups, database connection exhaustion is mathematically prevented without requiring external PgBouncer infrastructure.

---

## 8. Backup & Disaster Recovery Governance

### A. Automated Daily Backups
- **Schedule**: Daily at `20:00 UTC` (`01:30 AM IST`).
- **Retention**: 7 daily snapshots.
- **Location**: Multi-region regional resilience within GCP.

### B. Maintenance Window
- **Day**: Sunday
- **Hour**: `21:00 UTC` (`Monday 02:30 AM IST`)

### C. Verified Baseline Backup
- **Backup ID**: `1791191580964`
- **Timestamp**: `2026-10-05T09:13:00.964Z`
- **Status**: `SUCCESSFUL`
- **Type**: On-demand post-migration baseline snapshot
