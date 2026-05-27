# Progress Sharing Brief - 2026-05-28

이 문서는 2026-05-28 진행상황 공유회에서 `infra-orch-studio`의 현재 완성도, 실제 데모 흐름, 검증 근거, 남은 리스크를 짧고 정확하게 공유하기 위한 발표용 브리핑이다.

상세 기능과 테스트 내역은 `docs/current-features-and-verification.md`를 기준 문서로 사용한다.

## 1. One-Line Summary

`infra-orch-studio`는 현재 OpenStack 환경을 Environment 단위로 요청하고, OpenTofu plan을 생성한 뒤, admin approval을 거쳐 apply/destroy와 로그 확인까지 수행할 수 있는 MVP 상태다.

## 2. Current Status

현재 동작 가능한 범위:

- Web UI 또는 API를 통한 Environment 생성
- Environment update/destroy 요청
- MySQL 기반 Environment, Job, Audit, Provider connection 저장
- Runner가 queued Job을 claim하고 OpenTofu 실행
- `plan -> approval -> apply` admin gate
- job 상태 조회
- HTTP log snapshot 조회
- WebSocket 기반 job log stream
- Provider connection 저장 및 OpenStack preflight/catalog 조회
- Kubernetes prod overlay 배포
- Bastion Nginx를 통한 외부 HTTPS 접속

현재 공개 접속 경로:

- Web UI: `https://dusanserver.webhop.me/`
- API base: `https://dusanserver.webhop.me/api`
- WebSocket: `wss://dusanserver.webhop.me/ws`

확인된 배포 상태:

- `infra-orch-api`: Running
- `infra-orch-runner`: Running
- `infra-orch-web`: Running
- `infra-orch-mysql`: Running
- Bastion public `443` -> ingress-nginx HTTPS NodePort `10.10.0.206:30963`

## 3. What Changed Since MVP Skeleton

핵심 변경 사항:

- API와 Runner가 분리되어 API는 요청/상태 저장, Runner는 OpenTofu 실행을 담당한다.
- Runner가 MySQL queue에서 job을 가져와 OpenTofu `init`, `validate`, `plan`, `apply`, `output`을 실행한다.
- Environment lifecycle이 `draft/planning/pending_approval/approved/applying/active/destroyed/failed` 흐름으로 연결되었다.
- Apply와 destroy apply는 admin 권한과 approval 상태를 요구한다.
- 로그는 `.infra-orch/logs` artifact로 남고, API snapshot 및 WebSocket stream으로 노출된다.
- OpenStack provider credentials는 API에 저장되고 Runner가 runtime `clouds.yaml`로 변환해 사용한다.
- Smoke script가 실제 OpenStack provider로 create/apply/destroy까지 검증할 수 있게 확장되었다.
- Prod overlay가 API/runner/web image tag를 사용하고, GitHub Actions self-hosted workflow가 image build/push 및 kustomize tag bump를 수행한다.

## 4. Demo Story

발표 데모는 아래 순서가 가장 안정적이다.

1. Web UI 접속
   - `https://dusanserver.webhop.me/`
   - 로그인 후 dashboard 확인
2. Provider 상태 확인
   - provider connection 존재 여부 확인
   - preflight 실행으로 Keystone/Compute/Image/Network endpoint 확인
3. Environment 생성
   - basic template 선택
   - network/subnet/instance spec 입력
   - image/flavor는 catalog 기반 `id:<id>` 선택값 사용
4. Plan job 확인
   - Environment 생성 후 자동 또는 수동 plan job 확인
   - job 상태가 queued/running/done으로 이동하는지 확인
5. Plan review 및 approval
   - plan review 화면에서 impact summary 확인
   - admin 계정으로 approval
6. Apply 실행
   - admin apply 실행
   - job detail에서 status/log 확인
   - WebSocket log stream 동작 확인
7. 결과 확인
   - Environment status가 active로 변경되는지 확인
   - outputs/audit trail 확인
8. Cleanup
   - destroy plan 생성
   - destroy approval
   - destroy apply
   - Environment status가 destroyed로 변경되는지 확인

데모 시간이 짧으면 1~6까지만 보여주고, destroy는 smoke 결과로 설명한다.

## 5. Demo Credentials And Runtime Inputs

문서나 발표 자료에는 secret value를 노출하지 않는다.

데모 전에 필요한 정보:

- Admin login
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
- Provider encryption
  - `PROVIDER_SECRET_KEY`
- OpenStack connection
  - `OPENSTACK_CLOUD`
  - `OPENSTACK_AUTH_URL`
  - `OPENSTACK_USERNAME`
  - `OPENSTACK_PASSWORD`
  - `OPENSTACK_PROJECT_ID` 또는 project name/domain 정보
  - region name
  - optional endpoint override JSON
- Smoke input
  - `SMOKE_ENV_FILE`
  - optional `SMOKE_IMAGE`
  - optional `SMOKE_FLAVOR`
  - optional `SMOKE_SECURITY_GROUPS`
  - optional `SMOKE_SSH_KEY_NAME`

운영 환경에서 확인할 위치:

- Kubernetes secrets: `infra` namespace
- OpenStack/provider 관련 secret 또는 stored provider connection
- Bastion: `sulee-bastion`
- Kubernetes control plane: `k8s-master-01`

## 6. Verification Evidence

로컬/CI에서 확인한 검증 축:

- Go unit/contract tests
  - `go test ./...`
- Web build
  - `cd web && npm run build`
- Prod manifest render
  - `kubectl kustomize k8s/app/overlays/prod`
- API smoke
  - `hack/smoke-api-flow.sh`
- Real OpenStack smoke
  - `hack/smoke-openstack-apply.sh`
  - provider preflight
  - environment create
  - plan
  - approval
  - apply
  - WebSocket log check
  - destroy plan/apply cleanup
- WebSocket smoke
  - `go run ./cmd/ws-smoke`

최근 확인된 외부 접속:

```bash
curl -k -I https://dusanserver.webhop.me/
curl -k https://dusanserver.webhop.me/healthz
curl -k https://dusanserver.webhop.me/api/public-config
```

확인 결과:

- `/` returns `200`
- `/healthz` returns `ok`
- `/api/public-config` returns `{"allow_public_signup":false}`

## 7. CI/CD And Deployment

현재 repo에서 확인되는 자동화:

- `.github/workflows/api-ci.yml`
  - `main` push 중 Go/API/runner/template 관련 변경 감지
  - OpenTofu binary 준비
  - API/runner Docker image build/push
  - prod kustomize image tag bump
  - prod overlay render validation
  - tag bump commit push
- `.github/workflows/web-ci.yml`
  - `main` push 중 `web/**` 변경 감지
  - web Docker image build/push
  - prod kustomize image tag bump
  - prod overlay render validation
  - tag bump commit push

운영자가 공유한 배포 전제:

- GitHub push 이후 Jenkins를 통한 배포 진행 가능
- 발표 전에는 GitHub Actions tag bump와 Jenkins/ArgoCD sync 상태를 함께 확인해야 한다.

발표 전 확인 명령:

```bash
ssh sulee-bastion ssh k8s-master-01 kubectl -n infra get deploy,pods,svc,ingress -o wide
ssh sulee-bastion ssh k8s-master-01 kubectl -n argocd get application infra-orch-studio
```

## 8. Known Boundaries

현재 MVP 경계:

- 지원 provider는 OpenStack 중심이다.
- OpenTofu는 고정 템플릿 + 변수 주입 방식이다.
- instance count는 MVP 범위로 1~2개를 기준으로 제한한다.
- 장기 artifact archive backend는 아직 없다.
- cost/quota policy engine은 아직 없다.
- multi-tenant 권한 모델은 admin/operator 중심으로 단순화되어 있다.
- external NodePort 직접 접근은 지원 경로가 아니다. 사용자는 bastion public `443`을 사용한다.

## 9. Risks To Mention

공유회에서 선제적으로 말할 리스크:

- Demo는 OpenStack cloud 상태, quota, image/flavor availability에 영향을 받는다.
- Provider credential과 `PROVIDER_SECRET_KEY`가 맞지 않으면 runner가 저장된 provider password를 복호화할 수 없다.
- ingress host header가 맞지 않으면 Web/API가 정상이어도 외부 접속이 실패해 보일 수 있다.
- GitHub Actions/Jenkins/ArgoCD 중 어느 단계에서 배포가 멈췄는지 구분하는 운영 체크가 필요하다.
- Destroy cleanup 실패 시 OpenStack 자원이 남을 수 있으므로 발표 전후 quota와 resource cleanup을 확인해야 한다.

## 10. Next Recommended Work

다음 작업 우선순위:

1. Demo rehearsal 자동화
   - 발표 전 `smoke-openstack-existing-provider`를 실행해 실제 create/apply/destroy를 한 번 확인한다.
2. Operator runbook 보강
   - GitHub Actions, Jenkins, ArgoCD, Kubernetes 상태를 한 장으로 연결한다.
3. Failure recovery UX
   - failed job에서 retry/destroy/recover 경로를 더 명확히 보여준다.
4. Artifact retention policy
   - `.infra-orch/logs`, plan, state 보관 기간과 정리 기준을 정한다.
5. Quota/cost guardrail
   - OpenStack quota 초과나 비싼 flavor 선택을 사전에 경고한다.

## 11. Suggested Meeting Flow

30분 공유회 기준:

- 0~3분: 목표와 현재 상태 요약
- 3~8분: 아키텍처 설명(API, Runner, OpenTofu, MySQL, Web)
- 8~20분: live demo 또는 smoke 결과 기반 demo
- 20~24분: 검증 근거와 배포 경로 설명
- 24~28분: 남은 리스크와 다음 작업
- 28~30분: Q&A

## 12. Backup Plan

실시간 OpenStack demo가 실패할 경우:

1. Web UI 접속과 로그인까지만 live로 보여준다.
2. Provider preflight 또는 catalog 화면을 보여준다.
3. `docs/current-features-and-verification.md`의 smoke 결과와 job IDs를 근거로 end-to-end 성공 사례를 설명한다.
4. Kubernetes pod/ingress 상태와 `/healthz`, `/api/public-config` 응답으로 배포 상태를 증명한다.
5. 실패 원인은 OpenStack quota/provider 상태와 application 상태를 분리해 설명한다.

