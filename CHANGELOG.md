# Changelog

All notable changes to the **ShopCloud** platform will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [Unreleased]

### Added
* Work in progress for Phase 1 (Foundation)

---

## [0.1.0-phase1] — Phase 1: Foundation (2026-10-02)

### Added
* Monorepo workspace architecture with npm workspaces
* Shared domain contracts package (`@shopcloud/contracts`) with TypeScript enums, DTOs, and CloudEvent schemas
* Database layer (`@shopcloud/database`) with PostgreSQL Prisma schema, connection singleton, and seed script
* Core API Gateway (`@shopcloud/api`) with NestJS, health check probes (`/api/v1/health`), and modular structure
* Event consumer workers (`@shopcloud/workers`) daemon for inventory, payment, and notifications
* Customer storefront & cloud operations admin portal (`@shopcloud/web`) with React 18, Vite, and Tailwind CSS
* Local development environment with Docker Compose (PostgreSQL 16 & Google Cloud Pub/Sub emulator)
* Production multi-stage Dockerfiles for Cloud Run containerization
* Modular Terraform IaC foundation for GCP (Networking, Cloud SQL, Cloud Run, Pub/Sub, Storage, IAM, Monitoring)
* Performance benchmark load testing script (`infrastructure/k6/load-test.js`)
* GitHub Actions CI pipeline (`.github/workflows/ci.yml`)

---

## [0.0.0-architecture] — Phase 0: Architecture & Blueprint

### Added
* High-level event-driven target architecture on Google Cloud Platform
* Distributed systems resilience specifications (atomic stock reservation, idempotency, asynchronous order pipeline)
* Complete 18-phase implementation roadmap and portfolio case study blueprint
* Architecture Decision Records (ADR-0001, ADR-0002)
