# ShopCloud Architecture Cost Analysis: Cloud Run vs. GKE Autopilot vs. GKE Standard

## 1. Executive Summary & Recommendation

| Runtime Architecture | Estimated Monthly Cost (asia-south1) | Idle / Scale-to-Zero Cost | Operational Overhead | Portfolio Suitability |
|---|---|---|---|---|
| **Google Cloud Run (Current)** | **$0.00 / month** (within free tier) | **$0.00** | Minimal (Serverless) | ⭐⭐⭐⭐⭐ **Optimal (Target: ₹0 / $0)** |
| **GKE Autopilot** | **$45.00 – $75.00 / month** | **$0.00 – $73.00** (depends on credit) | Moderate (Managed K8s) | ⭐⭐ Costly for low-traffic dev |
| **GKE Standard** | **$75.00 – $145.00 / month** | **$75.00+** (fixed VM compute) | High (OS/K8s patching, pools) | ⭐ Not viable for zero-cost |

### Final Recommendation
**Retain Google Cloud Run as the active production platform.**  
Cloud Run natively scales to zero when traffic subsides, incurs $0 in idle compute, provides free built-in HTTPS endpoints, and operates completely within Google Cloud's permanent Free Tier for low-to-moderate portfolio traffic. 

The Kubernetes manifests authored in Phase 17 should be maintained as a **version-controlled portable deployment asset** demonstrating Kubernetes proficiency without incurring billable cluster compute charges.

---

## 2. Granular Pricing Breakdown (Official Google Cloud Pricing — asia-south1)

### 2.1 Cluster Management Control Plane Fee
- **Standard GKE Fee**: $0.10 per cluster per hour ($\approx \$73.00/\text{month}$).
- **Free Tier Allowance**: Google Cloud provides **one free cluster management fee per billing account** applied to either a single Autopilot or Standard cluster.
- **Limitation**: Any secondary cluster (e.g. separate dev vs. staging clusters) immediately incurs the full $73.00/month fee.

---

### 2.2 Compute & Memory Costs

#### Model A: Google Cloud Run (Current Production)
- **Billing Model**: Per-request, rounded to the nearest 100ms.
- **Rates (Tier 1)**:
  - vCPU: $\$0.00002400 / \text{vCPU-second}$ ($\$0.0864 / \text{vCPU-hour}$)
  - Memory: $\$0.00000250 / \text{GiB-second}$ ($\$0.009 / \text{GiB-hour}$)
  - Requests: $\$0.40 / \text{million requests}$
- **Permanent Monthly Free Tier**:
  - First **2 million requests** free.
  - First **360,000 vCPU-seconds** ($\approx 100\text{ vCPU-hours}$) free.
  - First **180,000 GiB-seconds** free.
- **Idle Cost**: With `min-instances = 0`, Cloud Run consumes **$0.00** during idle periods.

#### Model B: GKE Autopilot
- **Billing Model**: Billed strictly for the vCPU and memory *requested* by running Pods (no node VM management).
- **Rates (asia-south1)**:
  - vCPU: $\$0.0445 / \text{vCPU-hour}$
  - Memory: $\$0.0049 / \text{GiB-hour}$
- **Enforced Minimums**:
  - GKE Autopilot enforces minimum pod resource requests: `0.25 vCPU` and `0.5 GiB` RAM per container.
- **Footprint Calculation**:
  - 2 $\times$ `shopcloud-api`: $2 \times (0.25\text{ vCPU}, 0.5\text{ GiB}) = 0.5\text{ vCPU}, 1.0\text{ GiB}$
  - 2 $\times$ `shopcloud-web`: $2 \times (0.25\text{ vCPU}, 0.5\text{ GiB}) = 0.5\text{ vCPU}, 1.0\text{ GiB}$
  - 1 $\times$ `inventory-worker`: $0.25\text{ vCPU}, 0.5\text{ GiB}$
  - 1 $\times$ `notification-worker`: $0.25\text{ vCPU}, 0.5\text{ GiB}$
  - **Total 24/7 Baseline**: $1.5\text{ vCPU} + 3.0\text{ GiB RAM}$
  - **Monthly Compute Cost**:
    $$(1.5 \times \$0.0445 \times 730\text{ h}) + (3.0 \times \$0.0049 \times 730\text{ h}) = \$48.73 + \$10.73 = \mathbf{\$59.46 / \text{month}}$$

#### Model C: GKE Standard
- **Billing Model**: Billed for the underlying Compute Engine VM instances regardless of pod utilization.
- **Minimum Practical Sizing**:
  - 3 nodes $\times$ `e2-medium` (2 vCPU, 4 GB RAM, shared core) for cluster control-plane and system daemon headroom (kube-system, fluentbit, metrics-server).
  - Compute Engine rate: $\approx \$24.80 / \text{node / month}$
  - 3 nodes $\times \$24.80 = \mathbf{\$74.40 / \text{month}}$
- **Idle Cost**: VMs run 24/7; compute costs cannot scale to zero without tearing down node pools.

---

### 2.3 Networking & Ingress Costs

| Component | Cloud Run | GKE Ingress |
|---|---|---|
| **HTTPS Public Endpoint** | **FREE** (Built-in `*.run.app` with managed TLS) | External Application Load Balancer ($\approx \$18.25/\text{month}$ minimum forwarding rule fee) |
| **Ingress Controller** | Fully managed by Google | NGINX Ingress Controller (consumes node CPU/RAM) or GKE Gateway API |
| **Network Egress** | First 1 GB free / month; then $\$0.12/\text{GB}$ | Standard GCP egress rates apply |

---

## 3. Operational Burden Comparison

| Operational Task | Cloud Run | GKE Autopilot | GKE Standard |
|---|---|---|---|
| **OS Security Patching** | Automatic (Google managed) | Automatic (Google managed) | Operator responsible for node pool upgrades |
| **Cluster Version Upgrades** | None | Automatic release channels | Manual or release channel testing required |
| **Capacity Planning** | Automatic concurrency auto-scaling | Automatic node provisioning | Must balance node pool instance types & quotas |
| **Certificate Renewal** | Zero maintenance (Automated) | ManagedCertificate CRD setup | Cert-Manager or ManagedCertificate CRD |
| **Monitoring Setup** | Automatic metrics in Cloud Monitoring | Pre-installed Google Cloud Managed Prometheus | Manual collector configuration |

---

## 4. Cost Policy Compliance Statement

- In accordance with the **Zero-Cost GCP Policy**, no GKE cluster was provisioned, no billable APIs were enabled, and the Cloud SQL instance remained stopped.
- Total spend incurred for Phase 17: **₹0 / $0**.
