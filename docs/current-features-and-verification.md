# 현재 구현 기능 및 검증 내역

이 문서는 현재까지 구현된 `infra-orch-studio` 기능과 검증 방법을 한 곳에 정리한다. 구현 세부 계약은 `docs/api-spec.md`, 운영 절차는 `docs/operations-guide.md`, 축약 실행 절차는 `README.md`를 함께 참고한다.

최종 실 OpenStack end-to-end 검증 요약은 이 문서의 smoke 및 verification sections에 정리되어 있다.

## Summary

현재 플랫폼은 OpenStack 환경을 Environment 단위로 생성, 계획, 승인, 적용, 로그 조회, 정리까지 수행할 수 있는 MVP 상태다.

핵심 동작 흐름:

1. 사용자가 Web UI 또는 API로 Environment 요청을 생성한다.
2. API가 요청을 검증하고 MySQL에 Environment와 `tofu.plan` Job을 저장한다.
3. Runner가 queued Job을 claim한다.
4. Runner가 고정 OpenTofu 템플릿에 검증된 변수를 주입해 workdir을 만든다.
5. Runner가 OpenTofu `init`, `validate`, `plan`을 실행한다.
6. Admin이 plan을 승인한다.
7. Admin이 apply를 실행한다.
8. Runner가 같은 plan artifact로 OpenTofu `apply`를 실행하고 outputs를 저장한다.
9. API와 Web UI가 Job 상태, 로그 snapshot, WebSocket log stream, Environment audit trail을 제공한다.
10. Destroy도 plan, approval, apply 경계를 그대로 사용한다.

## Runtime Architecture

### API Service

주요 책임:

- HTTP API 제공
- httpOnly cookie 기반 인증
- 사용자/관리자 관리
- Environment 요청 검증
- Environment lifecycle 상태 전이
- Job 생성, 조회, approval, apply 요청 처리
- Provider connection 저장 및 preflight/resource catalog 조회
- Job log snapshot API와 WebSocket log stream 제공
- Audit event 기록

주요 코드:

- `cmd/api/main.go`
- `cmd/api/bootstrap.go`
- `internal/api/*.go`
- `internal/domain/*.go`
- `internal/storage/mysql/store.go`

### Runner Service

주요 책임:

- MySQL queue에서 queued Job claim
- Provider connection을 runtime `clouds.yaml`로 export
- Environment spec normalize/validate
- OpenTofu 템플릿 workdir 생성
- OpenTofu `init`, `validate`, `plan`, `apply`, `output` 실행
- Job별 stdout/stderr 로그 기록
- Environment 상태, plan path, outputs, 실패 정보를 MySQL에 반영

주요 코드:

- `cmd/runner/main.go`
- `internal/executor/executor.go`
- `internal/renderer/*.go`
- `internal/validation/environment.go`

### OpenTofu Layer

구현 원칙:

- 동적 HCL 생성을 최소화한다.
- 고정 템플릿과 모듈을 유지한다.
- Environment spec은 `terraform.tfvars.json`으로 주입한다.

주요 템플릿:

- `templates/opentofu/environments/basic`
- `templates/opentofu/modules/network`
- `templates/opentofu/modules/instance`

현재 지원 리소스:

- OpenStack network
- OpenStack subnet
- OpenStack port
- OpenStack compute instance
- OpenStack security group name to ID lookup
- image/flavor를 `id:<uuid>`, UUID, name 형태로 지정

## Implemented User-Facing Features

### 1. Authentication And Admin User Management

가능한 기능:

- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- optional public signup
- admin seed user upsert
- admin-only managed user 생성
- 사용자 disable/re-enable
- password reset
- admin role grant/revoke
- last active admin 보호

보안 특성:

- 세션은 httpOnly cookie 기반이다.
- public signup은 기본적으로 비활성화된다.
- `SESSION_COOKIE_SECURE=true` 배포에서도 smoke tooling이 session cookie를 명시적으로 재사용하도록 보강되었다.

검증 근거:

- `internal/api/auth_test.go`
  - signup/login/logout/me
  - signup disabled by default
  - admin user provisioning
  - disabled user login 차단
  - last active admin disable/demote 차단
  - password reset
  - role grant/revoke
- `cmd/api/bootstrap_test.go`
  - admin seed unset/bad config/upsert

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/api ./cmd/api
```

### 2. Environment Lifecycle

가능한 기능:

- Environment 생성과 동시에 initial plan Job queue
- Environment detail 조회
- Environment update plan queue
- destroy plan queue
- admin approval
- admin apply
- retry budget 기반 retry
- stale revision 방지를 위한 expected revision 검증
- lifecycle audit 기록
- artifacts, jobs, audit 조회

지원 상태:

- `planning`
- `pending_approval`
- `approved`
- `applying`
- `active`
- `destroying`
- `destroyed`
- `failed`

중요 정책:

- create/update plan은 `POST /api/environments/:id/plan`을 사용한다.
- destroy plan은 반드시 `POST /api/environments/:id/destroy`를 사용한다.
- apply와 destroy는 admin only다.
- apply는 승인된 plan artifact가 있어야 한다.

검증 근거:

- `internal/api/environments_test.go`
  - lifecycle approval and audit
  - create spec normalize
  - invalid spec reject
  - mutation atomicity
  - concurrent mutation conflict
  - expected revision mismatch
  - retry budget
  - destroy admin/confirmation requirement
  - destroy uses applied workdir
  - plan rejects destroy operation on plan endpoint
  - apply invalid state reject
  - retry admin gate for failed apply
  - plan retry clears attempt-scoped artifacts
  - environment jobs/artifacts endpoints
- `internal/domain/environment_lifecycle_test.go`

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/api ./internal/domain
```

### 3. Environment Spec Validation And Normalization

가능한 기능:

- environment, tenant, network, subnet, instance field trim
- required field 검증
- IPv4 CIDR 검증
- subnet/gateway 관계 검증
- instance count 제한
- security group / ssh key 입력 정규화
- OpenStack image/flavor 값 trim

검증 근거:

- `internal/validation/environment_test.go`
  - required field
  - CIDR validation
  - instance count limits
  - normalization
- `internal/renderer/renderer_test.go`
  - OpenStack 입력 trim
  - blank environment name reject
  - empty security groups 유지

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/validation ./internal/renderer
```

### 4. Plan Review

가능한 기능:

- 저장된 Environment에 대한 plan review 조회
- create wizard에서 저장 전 preview
- plan/apply 전에 operator가 위험 요약을 볼 수 있는 API 제공

주요 API:

- `GET /api/environments/:id/plan-review`
- `POST /api/environments/plan-review-preview`

검증 근거:

- `internal/api/environments_test.go`
  - `TestEnvironmentPlanReviewEndpoint`
  - `TestPlanReviewPreviewEndpoint`
  - `TestPlanReviewPreviewRejectsInvalidDomainSpec`

### 5. Request Drafts

가능한 기능:

- 자연어 요청을 즉시 실행하지 않고 structured Environment draft로 변환
- draft는 create wizard에 주입할 수 있다.
- draft 생성은 plan/apply를 우회하지 않는다.

주요 API:

- `POST /api/request-drafts`

검증 근거:

- `internal/api/environments_test.go`
  - `TestRequestDraftsReturnsStructuredEnvironmentDraft`

### 6. Provider Connection Management

가능한 기능:

- OpenStack provider 저장/upsert
- provider 목록 조회
- provider name safe validation
- domain name 기본값 `Default`
- `project_name` 또는 `project_id` scope 지원
- endpoint override JSON 검증
- interface / identity interface 검증
- provider preflight auth check
- provider resource catalog 조회

주요 API:

- `GET /api/providers`
- `POST /api/providers`
- `POST /api/providers/:name/preflight`
- `GET /api/providers/:name/resources`

검증 근거:

- `internal/api/providers_test.go`
  - preflight auth/endpoints
  - project ID without project name
  - endpoint override normalize
  - blank domain defaults
  - empty endpoint override reject
  - invalid URL reject
  - unsafe provider name reject
  - invalid interface reject
- `internal/provider/openstack_test.go`
  - clouds.yaml export
  - auth required endpoint check
  - project ID scope
  - empty project field omit
  - endpoint URL path handling

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/api ./internal/provider
```

### 7. Job Management And Logs

가능한 기능:

- Job create/list/get
- legacy job plan/apply compatibility route
- environment-managed plan/apply misuse 차단
- job status 조회
- job logs HTTP snapshot 조회
- WebSocket status/log stream
- runner error log 기록
- apply/destroy가 같은 workdir을 공유해도 job별 log directory를 분리

주요 API:

- `GET /api/jobs`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/logs`
- `GET /ws`

로그 저장 정책:

- runner는 stdout/stderr를 `.infra-orch/logs/{job_id}` 아래에 저장한다.
- API는 Job의 `log_dir`을 우선 사용한다.
- API pod는 `infra-orch-workdirs` PVC를 read-only로 mount해 runner가 만든 log file을 읽는다.

검증 근거:

- `internal/api/jobs_test.go`
  - create/list/get/apply contract
  - missing job 404
  - environment-managed source reject
  - logs endpoint reads persisted log_dir
- `internal/api/ws_test.go`
  - WebSocket tick emits status/log from log_dir
- `cmd/ws-smoke/main_test.go`
  - API base validation
  - required event normalization
  - secure-cookie header extraction
- 실 배포 WebSocket smoke
  - apply job `6a8ba704-1510-41ac-871c-8464f6dd9beb`에서 log event 수신
  - create apply output이 수신되고 destroy output과 섞이지 않음

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/api ./cmd/ws-smoke
```

WebSocket smoke 예시:

```bash
API_BASE=http://localhost:8080/api \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='...' \
JOB_ID='<job-id>' \
REQUIRED_EVENT=log \
GOCACHE=/private/tmp/infra-orch-go-build go run ./cmd/ws-smoke -timeout 15s
```

### 8. OpenTofu Execution

가능한 기능:

- tofu binary availability check
- `tofu init`
- `tofu validate`
- `tofu plan -out=.infra-orch/plan/plan.bin`
- `tofu apply <plan>`
- `tofu output -json`
- stdout/stderr log capture
- custom job log directory
- missing binary/invalid binary failure reporting

검증 근거:

- `internal/executor/executor_test.go`
  - missing binary error
  - check available
  - invalid binary error
  - WriteRunLogs
  - plan/apply/output flow with fake tofu
  - custom log directory
- `cmd/runner/main_test.go`
  - stale job update guard
  - conflict audit
  - failed job runner error log
  - destroy plan reuses applied workdir
  - provider store to clouds.yaml export
  - OpenStack env refresh

재검증 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./internal/executor ./cmd/runner
```

### 9. Overview And Operator Diagnostics

가능한 기능:

- Environment summary
- Job backlog summary
- queued/running/done/failed counts
- smoke failure diagnostics에 overview snapshot 출력
- Web UI dashboard에서 runner queue metric 표시
- Jobs page에서 queued work가 있는데 running job이 없을 때 runner idle warning 표시

검증 근거:

- `internal/api/overview_test.go`
  - auth required
  - environment/job aggregate
- `web/src/pages/Dashboard.tsx`
- `web/src/pages/Jobs.tsx`
- `hack/smoke-openstack-apply.sh`

### 10. Templates API

가능한 기능:

- template catalog 조회
- template detail 조회
- template validation
- startup template asset validation

주요 API:

- `GET /api/templates`
- `GET /api/templates/:kind/:name`
- `POST /api/templates/:kind/:name/validate`

검증 근거:

- `internal/api/environments_test.go`
  - templates endpoint lists repo-backed catalog
  - missing roots as empty catalog
  - template inspect and validate endpoints
- `internal/runtimecheck/templates_test.go`

### 11. Web UI

구현된 주요 화면:

- Login
- Dashboard
- Environments list
- Environment detail
- Create environment wizard
- Plan review
- Approval controls
- Jobs
- Job detail with persisted log snapshot and WebSocket updates
- Providers list/form
- Provider detail
- Provider resource detail
- Templates
- Users
- Audit

주요 UX/운영 기능:

- Environment spec form validation
- provider name safe validation
- provider domain default handling
- provider catalog resource display
- required catalog error banner
- dashboard job backlog metric
- jobs runner-idle warning
- job detail persisted logs + live WebSocket append

검증 근거:

- TypeScript production build
- shared provider name utility
- provider catalog option utilities
- web pages compile through `npm run build`

재검증 명령:

```bash
cd web
npm run build
```

### 12. Kubernetes Deployment

가능한 기능:

- preferred kustomize deployment under `k8s/app`
- API, runner, web, MySQL, workdir PVC 구성
- API/runner image 자동 build/push/tag bump through `api-ci`
- Web image 자동 build/push/tag bump through `web-ci`
- prod ingress
- API pod read-only workdir PVC mount for log serving
- runner pod read-write workdir PVC mount for plan/apply artifacts

주요 파일:

- `k8s/app/base/deployment.yaml`
- `k8s/app/base/web-deployment.yaml`
- `k8s/app/base/service.yaml`
- `k8s/app/base/workdirs-pvc.yaml`
- `k8s/app/overlays/prod/kustomization.yaml`
- `.github/workflows/api-ci.yml`
- `.github/workflows/web-ci.yml`

최종 배포 검증 기록:

- API/runner image: `10.10.0.190:32000/infra-orch-studio:a285f81`
- Web image: `10.10.0.190:32000/infra-orch-web:ae5440e`
- ArgoCD: `Synced / Healthy`

재검증 명령:

```bash
kubectl kustomize k8s/app/overlays/prod >/tmp/infra-orch-prod-manifest.yaml
kubectl -n infra get deploy infra-orch-api infra-orch-runner infra-orch-web
kubectl -n argocd get application infra-orch-studio
```

### 13. External Access

최종 확인된 public endpoint:

- Web UI: `https://dusanserver.webhop.me/`
- API base: `https://dusanserver.webhop.me/api`
- WebSocket: `wss://dusanserver.webhop.me/ws`

확인된 상태:

- `/` returns `200`
- `/healthz` returns `200`
- Bastion Nginx terminates public `443` and proxies `/` to ingress-nginx HTTPS NodePort `10.10.0.206:30963`.
- Direct public NodePort access to `dusanserver.webhop.me:30131` or `:30963` is not the supported user path.
- `/api/auth/me` returns `401` without login, which is expected
- `/ws` returns `401` without login, which is expected

## Smoke And Verification Tooling

### Local/API Smoke

Script:

- `hack/smoke-api-flow.sh`

검증 범위:

- API health
- login
- Environment 생성
- initial plan job 생성 확인
- environment 조회
- job 조회
- environment jobs 조회
- job logs endpoint shape 확인

실행:

```bash
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='...' \
API_BASE=http://localhost:8080/api \
make smoke-api
```

### WebSocket Smoke

Command:

- `make smoke-ws`
- `go run ./cmd/ws-smoke`

검증 범위:

- cookie login
- `/ws` connect
- job subscription
- status event
- log event
- `required-event=log`로 실제 log event 강제 가능

### OpenStack Provider Preflight Smoke

Targets:

- `make smoke-openstack-preflight`
- `make smoke-openstack-existing-provider-preflight`

검증 범위:

- API health/login
- provider presence or upsert
- provider auth preflight
- resource catalog discovery
- required catalog errors
- image/flavor/security group/keypair auto selection

### Full OpenStack End-To-End Smoke

Targets:

- `make smoke-openstack-apply`
- `make smoke-openstack-existing-provider`

검증 범위:

- API health/login
- provider preflight
- resource discovery
- Environment 생성
- plan job completion
- plan logs
- optional WebSocket log verification
- admin approval
- apply job completion
- active status
- apply logs
- destroy plan
- destroy approval
- destroy apply
- destroyed status
- cleanup logs

최종 성공 기록:

- 환경 ID: `8ff45da5-ab33-42da-93fc-7388e42b7dda`
- plan job: `4366f241-e7ec-41db-9420-ab4dccb734e0`
- apply job: `6a8ba704-1510-41ac-871c-8464f6dd9beb`
- destroy plan job: `e992234b-3983-4efa-bfd1-fca26edc11f9`
- destroy apply job: `fbbd3175-5ffe-4430-a9fc-ca32ffd1bcaa`
- deployed tag: `a285f81`

## CI/CD Verification

### General CI

Workflow:

- `.github/workflows/ci.yml`

검증:

- `make verify`
- web `npm run build`

최종 기록:

- `CI` success on commit `5da3633`

### API/Runner Image CI

Workflow:

- `.github/workflows/api-ci.yml`

검증:

- self-hosted runner에서 OpenTofu binary prefetch
- `sudo -n docker build`
- image push
- prod overlay image tag bump
- kustomize manifest validation
- commit/push

최종 기록:

- `api-ci` success on commit `a285f81`
- prod overlay bumped to API/runner image tag `a285f81`

### Web Image CI

Workflow:

- `.github/workflows/web-ci.yml`

검증:

- `sudo -n docker build --build-arg VITE_API_URL=/api`
- image push
- prod overlay image tag bump
- kustomize manifest validation
- commit/push

최종 기록:

- web image tag `ae5440e`

## Commands Used For Final Verification

대표 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./...
npm run build
kubectl kustomize k8s/app/overlays/prod >/tmp/infra-orch-prod-manifest.yaml
SMOKE_ENV_FILE=/tmp/infra-orch-smoke-existing.env bash hack/smoke-openstack-apply.sh
API_BASE=http://localhost:18081/api JOB_ID=6a8ba704-1510-41ac-871c-8464f6dd9beb REQUIRED_EVENT=log GOCACHE=/private/tmp/infra-orch-go-build go run ./cmd/ws-smoke -timeout 15s
```

검증된 결과:

- Go tests passed
- Web build passed
- prod overlay rendered
- real OpenStack plan/apply/destroy smoke passed
- job logs HTTP endpoint returned runner-produced logs
- WebSocket returned apply log event
- apply and destroy logs were isolated by job ID

## Current Boundaries

현재 MVP로 명시적으로 구현된 범위:

- Provider는 OpenStack 중심이다.
- OpenTofu layer는 고정 템플릿 + 변수 주입 방식이다.
- API와 runner는 분리되어 있다.
- MySQL이 운영 metadata source of truth다.
- Runner PVC가 plan/apply/log artifact backend다.
- Admin approval boundary가 apply와 destroy에 적용된다.

현재 의도적으로 MVP 밖에 남긴 범위:

- 복잡한 멀티 테넌트 RBAC
- 다중 cloud provider 구현
- 대규모 병렬 provisioning 최적화
- 장기 artifact archival backend
- 세밀한 cost/ quota policy engine

## Quick Reverification Checklist

1. Unit/contract tests:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./...
```

2. Web build:

```bash
cd web
npm run build
```

3. Manifest render:

```bash
kubectl kustomize k8s/app/overlays/prod >/tmp/infra-orch-prod-manifest.yaml
```

4. Deployment health:

```bash
kubectl -n argocd get application infra-orch-studio
kubectl -n infra get deploy infra-orch-api infra-orch-runner infra-orch-web
```

5. Real OpenStack smoke:

```bash
SMOKE_ENV_FILE=/path/to/filled-existing-provider.env make smoke-openstack-existing-provider
```

6. External access:

```bash
curl -k https://dusanserver.webhop.me/
curl -k https://dusanserver.webhop.me/healthz
```
