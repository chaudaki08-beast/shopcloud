# ShopCloud Cloud Monitoring Dashboards & Alert Policies

## 1. Overview

ShopCloud provisions its operational dashboards and alerting policies as code through HashiCorp Terraform (`infrastructure/terraform/modules/monitoring`).

All telemetry originates from native Google Cloud Platform hypervisor metrics. No custom metric ingestion fees or memory-heavy agents are required, maintaining full compliance with the project's zero-cost cloud mandate (**$0 / ₹0 avoidable spend**).

---

## 2. Operational Dashboard: `ShopCloud Operations Dashboard (Dev)`

The operational dashboard provides real-time visibility across ingress, compute, asynchronous messaging, and worker performance.

### Dashboard Grid Layout & Widget Specifications

| Widget Title | Metric Query | Alignment & Reducer | Chart Type | Operational Significance |
| :--- | :--- | :--- | :--- | :--- |
| **Cloud Run Request Rate** | `run.googleapis.com/request_count`<br>`service_name IN (api, web)` | Align: `RATE` (60s)<br>Reduce: `SUM`<br>Group: `service_name, response_code_class` | Stacked Line | Visualizes total incoming traffic partitioned by HTTP status classes (2xx, 3xx, 4xx, 5xx). |
| **Cloud Run Request Latencies (P95)** | `run.googleapis.com/request_latencies`<br>`service_name = "shopcloud-api"` | Align: `PERCENTILE_95` (60s)<br>Reduce: `MAX` | Line | Tracks 95th percentile request latency to verify API responsiveness SLO (< 500ms target). |
| **Cloud Run 5xx Server Error Rate** | `run.googleapis.com/request_count`<br>`response_code_class = "5xx"` | Align: `RATE` (60s)<br>Reduce: `SUM` | Line | Detects internal server errors, unhandled exceptions, and database connectivity issues. |
| **Container CPU Utilization** | `run.googleapis.com/container/cpu/utilizations` | Align: `PERCENTILE_95` (60s)<br>Reduce: `MAX` | Line | Identifies CPU bottlenecks or throttling on Cloud Run microservices. |
| **Active Container Instances** | `run.googleapis.com/container/instance_count` | Align: `MAX` (60s)<br>Reduce: `SUM` | Step Line | Confirms Cloud Run scale-to-zero behavior (0 instances when idle, up to 3 under traffic). |
| **Pub/Sub Worker Subscription Backlog** | `pubsub.googleapis.com/subscription/num_undelivered_messages`<br>`subscription_id IN (inventory-sub, notification-sub)` | Align: `MAX` (60s)<br>Reduce: `MAX` | Line | Monitors queue depth and consumer processing lag for inventory and notifications. |
| **Pub/Sub Oldest Unacked Message Age** | `pubsub.googleapis.com/subscription/oldest_unacked_message_age` | Align: `MAX` (60s)<br>Reduce: `MAX` | Line | Detects stuck messages or consumer starvation in seconds. |
| **Dead-Letter Queue (DLQ) Activity** | `pubsub.googleapis.com/subscription/num_undelivered_messages`<br>`subscription_id IN (inventory-dlq-sub, notification-dlq-sub)` | Align: `MAX` (60s)<br>Reduce: `SUM` | Line | Flags poison-pill messages or events that exceeded maximum delivery attempts (5 retries). |

---

## 3. Actionable Alert Policies

Alert policies are configured in Terraform with symptom-based thresholds, evaluation duration windows, and clear incident documentation:

### Alert Policy Matrix

| Policy Name | Monitored Metric | Threshold Condition | Duration | Severity | Action & Runbook |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Sustained 5xx Errors** | `run.googleapis.com/request_count` (`5xx`) | Rate > 1 req/sec | 5 minutes | `CRITICAL` | [Investigating 5xx Spikes](incident-runbooks.md#1-investigating-api-5xx-spikes) |
| **High Request Latency P95** | `run.googleapis.com/request_latencies` (P95) | P95 > 1500 ms | 5 minutes | `WARNING` | [Diagnosing Slow Requests](incident-runbooks.md#2-diagnosing-slow-requests) |
| **Worker Backlog Accumulation** | `pubsub.googleapis.com/subscription/num_undelivered_messages` | Undelivered > 100 msgs | 10 minutes | `WARNING` | [Investigating Pub/Sub Backlog](incident-runbooks.md#3-investigating-pubsub-backlog) |
| **Dead-Letter Queue Activity** | `pubsub.googleapis.com/subscription/num_undelivered_messages` (DLQ) | Undelivered > 0 msgs | 5 minutes | `ERROR` | [Triage DLQ Messages](incident-runbooks.md#4-handling-dead-letter-messages-safely) |

### Missing Data & Evaluation Behavior
- **Evaluation Period**: Alignment periods use a 60-second rollup window; conditions require sustained breaches across the specified duration (5m or 10m) to eliminate transient noise.
- **Missing Data Treatment**: Missing data is treated as `NOT_BREACHING`. In a scale-to-zero serverless architecture, absence of traffic generates zero metrics. Treating missing data as breaching would trigger false positive alert storms whenever services scale down to zero.
- **Cloud SQL Handling**: No alert policies trigger on `shopcloud-postgres` being in `STOPPED` state, as stopped compute is an intentional cost-control measure.

---

## 4. Notification Channel Strategy

To avoid unintentional recurring charges from external SMS or third-party monitoring subscriptions:
1. `var.monitoring_notification_channels` defaults to an empty list `[]` in the development environment.
2. When approved, email notification channels or Cloud Functions webhook dispatchers can be linked by passing channel IDs in `terraform.tfvars`:
   ```hcl
   monitoring_notification_channels = [
     "projects/project-c3f386b1-6c37-468d-8ee/notificationChannels/1234567890123456789"
   ]
   ```
