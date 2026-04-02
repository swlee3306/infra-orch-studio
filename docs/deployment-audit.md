# Deployment Audit

> Historical snapshot: 초기 배포 구조 감사 기록이다. 최신 배포/운영 기준은 `docs/operations-guide.md`, `docs/configuration-reference.md`, `docs/release-checklist.md`를 우선 본다.

## Current State

The repository currently has two deployment paths:

- `deployments/k8s/`: a hand-applied local/development path.
- `k8s/app/`: a kustomize-based application path intended for environment overlays.

The codebase itself runs as a split architecture:

- API process: HTTP, auth, job metadata, WebSocket.
- Runner process: OpenTofu execution, rendering, and job completion.
- Web UI: Nginx-served static app that proxies `/api` and `/ws` to the API service.

## Findings

### 1. Deployment paths were inconsistent

- The Docker image builds both `infra-orch-api` and `infra-orch-runner` from one runtime image.
- `deployments/k8s/` previously assumed separate API and runner images.
- `k8s/app/` had a more realistic shared-image model, but it did not yet include enough operational hardening.

### 2. State was not durable enough

- Runner workdirs were backed by `emptyDir`, so plan artifacts and render outputs would disappear on pod restart.
- MySQL had a PVC, but application workdir state did not.

### 3. Secrets and config were only partially modeled

- MySQL credentials existed, but admin seed credentials and OpenStack runner config were not represented consistently.
- Some values were embedded inline in Deployment manifests instead of being separated into config or secret objects.

### 4. Production exposure was too thin

- No ingress layer existed for the app path.
- Probes and resource requests were sparse.
- There was no explicit dev/stage/prod overlay story beyond a single prod overlay.

## Recommendations Implemented in This Pass

- Standardized the app path around a shared API/runner image.
- Added persistent workdir storage for the runner.
- Added config and secret examples for admin seed and OpenStack access.
- Added probes and resource requests to the workloads.
- Added dev, stage, and prod overlays for the app kustomize path.
- Added ingress manifests for stage and prod.

## Remaining Gaps

- Database backups and restore automation are still operational tasks, not encoded in manifests.
- Metrics/log aggregation are not yet wired into a cluster-wide observability stack.
- OpenStack secret content is still an operator-managed input and must be replaced with real credentials before any live apply.
- The release flow still relies on manual verification of image tags and manifest promotion.

## Files To Review First

- `k8s/app/base/*`
- `k8s/app/overlays/dev/*`
- `k8s/app/overlays/stage/*`
- `k8s/app/overlays/prod/*`
- `k8s/mysql/base/*`
- `deployments/k8s/*`
- `web/nginx.conf`
