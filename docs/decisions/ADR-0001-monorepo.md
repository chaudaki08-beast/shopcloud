# ADR-0001: Use a Monorepo Architecture

## Status
Accepted

## Context
ShopCloud is an end-to-end cloud-native platform comprising multiple interdependent components:
* Customer storefront & admin web application (`apps/web`)
* NestJS REST API Gateway (`apps/api`)
* Asynchronous Pub/Sub background workers (`apps/workers`)
* Shared domain contracts and CloudEvent schemas (`packages/contracts`)
* Database ORM schemas, seeds, and migrations (`packages/database`)
* Infrastructure as Code modules (`infrastructure/terraform`)

Managing these across separate Git repositories creates high friction for contract synchronization, type-sharing, atomic versioning, and CI/CD orchestration.

## Options Considered
1. **Multi-Repo Architecture**: Separate GitHub repositories for frontend, backend, workers, and infrastructure.
2. **Polyrepo with Git Submodules**: Independent repos linked via submodules.
3. **Monorepo with Workspaces**: Single Git repository containing `apps/`, `packages/`, and `infrastructure/` with workspace dependency linking.

## Decision
We selected **Monorepo with Workspaces** (`npm workspaces` / `pnpm`).
Shared TypeScript definitions (`@shopcloud/contracts`) and database configurations (`@shopcloud/database`) are consumed directly by `apps/api`, `apps/workers`, and `apps/web`.

## Consequences
### Positive
* Single source of truth for all domain DTOs, enums, and CloudEvent schemas.
* Breaking API/contract changes can be made and tested atomically across frontend and backend.
* Unified CI/CD validation pipelines across services.
* Simplifies local developer workflow and onboarding.

### Negative
* Larger repository size.
* Requires discipline in boundary enforcement between modules to avoid accidental tight coupling.
