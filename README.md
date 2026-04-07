# infra-orch-studio

템플릿, API, 웹 UI를 통해 OpenTofu를 활용하여 **OpenStack 인프라 환경(Environment)** 을 선언형으로 생성·관리하는 환경 단위 오케스트레이션 플랫폼.

## Current platform scope
- Environment 생성 → 초기 plan 큐잉
- Environment update / destroy plan 큐잉
- plan 승인(admin) → apply 실행(admin)
- environment 상태, retry budget, audit trail, artifact 경로 추적
- job 상태/로그 조회 (WebSocket)

## Architecture
- API 서비스와 runner(OpenTofu 실행)는 분리
- API는 job을 생성/조회만 하고, **tofu 실행은 runner가 수행**
- OpenTofu 레이어는 "고정 템플릿 + 변수 주입" 중심

문서:
- `docs/architecture.md`
- `docs/roadmap.md`

---

## API

### Auth
- `POST /api/auth/signup` (optional, disabled by default)
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/auth/me`
- `POST /api/admin/users` (admin only, bootstrap/onboarding)

세션은 **httpOnly cookie** 기반.
공개 signup은 기본적으로 꺼져 있으며, `ALLOW_PUBLIC_SIGNUP=true` 일 때만 허용된다.

Admin seed:
- `ADMIN_EMAIL`, `ADMIN_PASSWORD` 를 API에 설정하면 시작 시 admin 유저를 upsert 합니다.
- 둘 중 하나만 설정하면 API가 시작 시 즉시 실패합니다.

Template runtime validation:
- API와 runner는 시작 시 `TEMPLATES_ROOT`, `MODULES_ROOT`, 그리고 기본 템플릿 `basic/{main.tf,variables.tf,outputs.tf,versions.tf}` 존재를 검증합니다.
- 기본 템플릿 자산이 없으면 런타임 중 plan에서 늦게 실패하지 않고 startup에서 즉시 실패합니다.

### Environments
- `GET /api/environments?limit=50`
- `POST /api/environments`
- `GET /api/environments/:id`
- `POST /api/environments/:id/plan`
- `GET /api/environments/:id/plan-review`
- `POST /api/environments/plan-review-preview`
- `POST /api/environments/:id/approve` (admin only)
- `POST /api/environments/:id/apply` (admin only)
- `POST /api/environments/:id/retry`
- `POST /api/environments/:id/destroy` (admin only, requires confirmation payload)

`POST /api/environments/:id/plan` 는 create/update 전용이다. destroy plan은 반드시 `POST /api/environments/:id/destroy` 를 사용해야 typed confirmation과 audit metadata가 유지된다.
- `GET /api/environments/:id/audit`
- `GET /api/environments/:id/jobs`
- `GET /api/environments/:id/artifacts`

### Request Drafts
- `POST /api/request-drafts`

자연어 요청을 즉시 실행하지 않고, create wizard에 주입할 수 있는 구조화된 environment draft만 생성한다. 생성된 draft도 기존 `plan -> review -> approval -> apply` 흐름을 그대로 따라야 한다.

### Templates
- `GET /api/templates`
- `GET /api/templates/:kind/:name`
- `POST /api/templates/:kind/:name/validate`

### Audit
- `GET /api/audit?resource_type=environment&limit=200`

### Jobs
- `GET /api/jobs?limit=50`
- `POST /api/jobs`
- `GET /api/jobs/:id`
- `POST /api/jobs/:id/plan`
- `POST /api/jobs/:id/apply` (admin only)

`/api/jobs/*` 는 legacy execution view 호환용이다. `environment_id` 가 있는 plan/apply 흐름은 반드시 `/api/environments/*` 를 사용해야 approval, audit, 상태 갱신이 일관되게 유지된다.

### WebSocket
- `GET /ws` (cookie auth)
- client → server: `{ "type": "subscribe", "jobId": "..." }`
- server → client:
  - `{ "type": "status", "jobId": "...", "status": "...", "error": "..." }`
  - `{ "type": "log", "jobId": "...", "file": "...", "message": "..." }`

로그는 workdir의 `.infra-orch/logs/*.log` 를 tail 하는 방식.

---

## Storage (MySQL)

필수 env (API/runner 공통):
- `MYSQL_HOST`, `MYSQL_PORT`
- `MYSQL_DB`, `MYSQL_USER`, `MYSQL_PASSWORD`

> NOTE: 현재 API는 AuthStore가 필요하므로 **MySQL이 필수**입니다.

---

## Local dev

Requirements: Go 1.23+, Node 18+

### 1) API + runner

```bash
# API
export MYSQL_HOST=127.0.0.1
export MYSQL_PORT=3306
export MYSQL_DB=infra_orch
export MYSQL_USER=infra_orch
export MYSQL_PASSWORD=pass

export ADMIN_EMAIL=admin@example.com
export ADMIN_PASSWORD=change-me

make fmt
make test
make api

# in another shell
TOFU_BIN=tofu \
OPENSTACK_CLOUD=exporter-internal \
OPENSTACK_CONFIG_PATH=$HOME/.config/openstack/clouds.yaml \
RUNNER_POLL_INTERVAL=2s \
make runner
```

Health check:
```bash
curl -s localhost:8080/healthz
```

### 2) Web UI

```bash
cd web
npm install
VITE_API_URL=http://localhost:8080/api npm run dev
```

Open: http://localhost:5173

---

## Kubernetes (namespace: infra)

Manifests:
- preferred: `k8s/app/`
- legacy examples: `deployments/k8s/`

Preferred overlay path:
```bash
kustomize build k8s/app/overlays/prod | kubectl apply -f -
```

Legacy example path:
```bash
kubectl apply -f deployments/k8s/namespace.yaml
# create mysql secret (example file is base64-encoded)
kubectl apply -f deployments/k8s/secret-mysql.example.yaml

kubectl apply -f deployments/k8s/api-deployment.yaml -f deployments/k8s/api-service.yaml
kubectl apply -f deployments/k8s/runner-deployment.yaml
kubectl apply -f deployments/k8s/web-deployment.yaml -f deployments/k8s/web-service.yaml
```

Port-forward:
```bash
kubectl -n infra port-forward svc/infra-orch-api 8080:8080
kubectl -n infra port-forward svc/infra-orch-web 8081:80
```

Then:
- API: http://localhost:8080
- Web: http://localhost:8081
