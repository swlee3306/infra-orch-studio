# 진행상황 설명 자료 - 2026-05-27

이 문서는 2026-05-27 진행상황 설명을 위해 `infra-orch-studio`가 처음 어떤 상태였고, 무엇을 목표로 잡았고, 어떤 순서로 구현/검증했으며, 현재 어디까지 마무리됐는지를 읽기 쉽게 정리한 자료다.

상세 기능 목록과 테스트 근거는 `docs/current-features-and-verification.md`, 짧은 공유회 브리핑은 `docs/progress-sharing-2026-05-28.md`를 함께 참고한다.

## 1. 한 문장 요약

처음에는 OpenStack + OpenTofu 오케스트레이션 플랫폼의 뼈대에 가까웠지만, 현재는 Environment 생성부터 plan, admin approval, apply, log/WebSocket 확인, destroy cleanup까지 이어지는 실제 시연 가능한 MVP 흐름이 연결되어 있다.

## 2. 처음 시작했을 때의 문제의식

초기 목표는 단순한 API나 화면 데모가 아니라, 실제 요청을 받아 OpenStack 리소스를 만들 수 있는 환경 단위 오케스트레이션 플랫폼을 만드는 것이었다.

그 기준에서 중요했던 문제는 세 가지였다.

1. 사용자가 요청한 Environment가 실제 실행 단위인 Job으로 연결되어야 했다.
2. API 서버가 직접 OpenTofu를 실행하지 않고, 별도 Runner가 안전하게 작업을 가져가 실행해야 했다.
3. 운영자가 plan 결과를 확인하고 admin 권한으로 apply를 승인/실행할 수 있어야 했다.

즉, 핵심은 화면이나 문서가 아니라 아래 실행 경로를 실제로 연결하는 것이었다.

```text
Environment request
-> Job queued
-> Runner claim
-> OpenTofu init/validate/plan
-> Admin approval
-> OpenTofu apply
-> Job status/logs/WebSocket
-> Destroy cleanup
```

## 3. 목표로 잡은 MVP 범위

이번 MVP의 범위는 다음으로 잡았다.

- Environment 생성 요청
- Environment update/destroy 요청
- Job 생성 및 상태 전이
- OpenTofu plan 생성
- Admin-only approval
- Admin-only apply
- Job log 조회
- WebSocket 기반 log stream
- Provider connection 저장 및 OpenStack preflight
- MySQL 기반 저장소
- API와 Runner 분리
- Kubernetes 배포 구성
- 외부 접속 가능한 Web UI/API

의도적으로 제외하거나 다음 단계로 미룬 항목도 있다.

- 복잡한 multi-tenant 권한 모델
- 장기 artifact archive backend
- 세밀한 quota/cost policy engine
- 여러 provider를 동시에 깊게 지원하는 구조
- 임의 HCL 편집 기능

## 4. 진행 순서

### 4.1 API와 도메인 흐름 정리

먼저 Environment와 Job의 관계를 정리했다.

- Environment는 사용자가 원하는 인프라 상태를 나타낸다.
- Job은 실제 실행 단위다.
- plan/apply/destroy는 Environment lifecycle 안에서 Job으로 기록된다.
- 상태, approval, retry, audit trail은 MySQL에 남는다.

이 단계에서 중요한 점은 apply를 아무나 실행하지 못하게 한 것이다. Plan을 보고 승인한 뒤 admin만 apply할 수 있게 했다.

### 4.2 Runner 분리

다음으로 API와 Runner의 책임을 분리했다.

- API는 HTTP 요청, 인증, 상태 저장, Job 생성만 담당한다.
- Runner는 MySQL queue에서 queued Job을 claim한다.
- Runner가 OpenTofu workdir을 만들고 `init`, `validate`, `plan`, `apply`, `output`을 실행한다.

이 구조 덕분에 API 서버가 긴 OpenTofu 프로세스에 묶이지 않고, 실행 실패나 로그도 Job 단위로 추적할 수 있다.

### 4.3 OpenTofu 실행 방식 고정

OpenTofu 레이어는 동적 HCL 생성이 아니라 고정 템플릿 + 변수 주입 방식으로 유지했다.

현재 기본 템플릿은 다음 리소스를 다룬다.

- OpenStack network
- OpenStack subnet
- OpenStack port
- OpenStack compute instance
- security group name to ID lookup
- image/flavor `id:<id>`, UUID, name 처리

사용자 입력은 Environment spec으로 받고, Runner가 `terraform.tfvars.json` 형태로 렌더링한다.

### 4.4 Provider credential 연결

실제 OpenStack 요청을 처리하려면 provider credential이 Runner까지 전달되어야 했다.

구현된 흐름은 다음과 같다.

1. API가 provider connection을 저장한다.
2. 민감한 password는 `PROVIDER_SECRET_KEY`로 암호화해 저장한다.
3. Runner가 Job 실행 시 MySQL에서 provider connection을 읽는다.
4. Runner가 runtime `clouds.yaml`을 생성한다.
5. OpenTofu provider가 이 `clouds.yaml`을 사용해 OpenStack API에 접근한다.

이 덕분에 배포된 runner가 별도 재시작 없이 새 provider connection을 사용할 수 있다.

### 4.5 로그와 WebSocket

초기에는 실행 중인 로그를 운영자가 확인하기 어려운 문제가 있었다.

이를 해결하기 위해 다음을 추가했다.

- `GET /api/jobs/{id}/logs`
- WebSocket `/ws`
- Runner failure log artifact
- `.infra-orch/logs` 기반 log snapshot
- Web UI Job Detail 화면의 기존 로그 + live stream 표시

이제 job이 끝난 뒤에도 HTTP로 로그를 확인할 수 있고, 실행 중에는 WebSocket으로 stream을 볼 수 있다.

### 4.6 Smoke와 검증 자동화

실제 시연 가능한지를 확인하기 위해 smoke script를 강화했다.

주요 smoke 경로:

- API smoke: login, Environment 생성, Job 조회, log endpoint 확인
- WebSocket smoke: 인증된 WebSocket 연결과 status/log event 확인
- OpenStack smoke: provider preflight, create, plan, approval, apply, WebSocket log, destroy cleanup
- Config dry-run: 실제 secret 값을 출력하지 않고 smoke 입력값 형식 검증

특히 OpenStack smoke는 apply 성공 후 destroy cleanup까지 수행하도록 만들어, 데모 후 자원이 남는 위험을 줄였다.

### 4.7 배포와 외부 접속

Kubernetes prod overlay와 외부 접속 경로도 확인했다.

현재 공개 접속 경로:

- Web UI: `https://dusanserver.webhop.me/`
- API base: `https://dusanserver.webhop.me/api`
- WebSocket: `wss://dusanserver.webhop.me/ws`

배포 구조:

- `infra-orch-api`
- `infra-orch-runner`
- `infra-orch-web`
- `infra-orch-mysql`
- ingress-nginx
- bastion Nginx public `443`

확인된 외부 라우팅:

```text
Browser
-> https://dusanserver.webhop.me/
-> Bastion Nginx public 443
-> ingress-nginx HTTPS NodePort 10.10.0.206:30963
-> infra-orch-web
-> /api and /ws proxy to infra-orch-api
```

주의할 점은 `dusanserver.webhop.me:30131` 또는 `:30963` 같은 NodePort 직접 접근이 사용자 경로가 아니라는 점이다. 사용자는 `https://dusanserver.webhop.me/`로 접속해야 한다.

## 5. 현재 가능한 기능

현재 사용자가 할 수 있는 일은 다음과 같다.

- 로그인/logout/session 확인
- admin user 관리
- provider connection 저장
- provider preflight 실행
- provider resource catalog 조회
- Environment 생성
- Environment 수정 plan 생성
- Environment destroy plan 생성
- plan review 확인
- admin approval
- admin apply
- job 목록/상세 조회
- job log snapshot 조회
- WebSocket log stream 확인
- audit trail 확인
- Kubernetes 배포 상태 확인

## 6. 실제 요청 처리에 필요한 credential

발표 자료나 문서에는 secret value를 넣지 않는다. 필요한 항목 종류만 말하면 된다.

필수 계정/secret:

- Admin login
  - `ADMIN_EMAIL`
  - `ADMIN_PASSWORD`
- Provider encryption
  - `PROVIDER_SECRET_KEY`
- OpenStack
  - `OPENSTACK_CLOUD`
  - `OPENSTACK_AUTH_URL`
  - `OPENSTACK_USERNAME`
  - `OPENSTACK_PASSWORD`
  - `OPENSTACK_PROJECT_ID` 또는 project name/domain
  - region
  - interface: `public`, `internal`, `admin` 중 하나
  - optional endpoint override JSON
- Smoke/demo
  - `SMOKE_ENV_FILE`
  - optional image/flavor/security group/keypair 설정

운영 환경에서 확인할 위치:

- Kubernetes `infra` namespace secrets
- 저장된 provider connection
- `sulee-bastion`
- `k8s-master-01`

## 7. 검증한 내용

검증은 세 층으로 나누어 진행했다.

### 7.1 코드 레벨 검증

- Go unit/contract tests
- Runner/OpenTofu executor tests
- API auth/environment/job tests
- Provider validation tests
- Web build

대표 명령:

```bash
GOCACHE=/private/tmp/infra-orch-go-build go test ./...
GOCACHE=/private/tmp/infra-orch-go-build go build ./...
cd web
npm run build
```

### 7.2 배포 레벨 검증

- prod kustomize manifest render
- Kubernetes deployment/pod/service/ingress 상태 확인
- ArgoCD application 상태 확인

대표 명령:

```bash
kubectl kustomize k8s/app/overlays/prod >/tmp/infra-orch-prod-manifest.yaml
kubectl -n infra get deploy,pods,svc,ingress -o wide
kubectl -n argocd get application infra-orch-studio
```

### 7.3 실제 흐름 검증

- API smoke
- WebSocket smoke
- Real OpenStack smoke
- apply 이후 destroy cleanup
- 외부 endpoint 확인

최근 외부 endpoint 확인:

```bash
curl -k -I https://dusanserver.webhop.me/
curl -k https://dusanserver.webhop.me/healthz
curl -k https://dusanserver.webhop.me/api/public-config
```

확인 결과:

- `/` returns `200`
- `/healthz` returns `ok`
- `/api/public-config` returns `{"allow_public_signup":false}`

## 8. 배포 자동화 상태

현재 GitHub push 이후 배포로 이어질 수 있는 기반이 있다.

확인된 repo 자동화:

- `api-ci`
  - API/Runner 관련 변경 감지
  - OpenTofu binary 준비
  - Docker image build/push
  - prod overlay image tag bump
  - manifest render validation
- `web-ci`
  - Web 변경 감지
  - web image build/push
  - prod overlay image tag bump
  - manifest render validation

운영 전제:

- GitHub에 push하면 Jenkins를 통한 배포 진행 가능
- 발표 전에는 GitHub Actions, Jenkins, ArgoCD 중 어디까지 반영됐는지 확인해야 한다.

## 9. 현재 마무리 상태

현재 기준으로 MVP 완료라고 말할 수 있는 부분:

- Environment -> Job -> Runner -> OpenTofu 흐름이 코드상 연결되어 있다.
- Job 생성 후 상태 변화와 로그 저장/조회가 존재한다.
- Admin approval/apply 제한이 구현되어 있다.
- WebSocket 또는 HTTP 기반 log 확인 경로가 있다.
- OpenStack provider credential이 API 저장소에서 Runner 실행으로 이어진다.
- 실제 OpenStack smoke가 create/apply/destroy 흐름을 검증할 수 있다.
- 외부 공개 URL로 Web/API health가 확인된다.

아직 제품화 관점에서 남은 부분:

- 실패 복구 UX 보강
- quota/cost guardrail
- 장기 artifact retention
- 운영 runbook 통합
- 데모 전 smoke rehearsal 자동화

## 10. 내일 설명할 때 추천 순서

설명은 아래 순서로 하면 자연스럽다.

1. 목표
   - OpenStack 리소스를 Environment 단위로 요청/승인/적용하는 플랫폼을 만들고 있다.
2. 시작 상태
   - API, Runner, OpenTofu, Web이 있었지만 실제 실행 흐름과 검증이 부족했다.
3. 핵심 설계
   - API는 요청/상태, Runner는 실행, MySQL은 상태 저장, OpenTofu는 고정 템플릿 + 변수 주입.
4. 구현한 흐름
   - Environment 생성, plan, approval, apply, logs, destroy.
5. 실제 검증
   - unit/build, k8s manifest, API smoke, WebSocket smoke, OpenStack smoke.
6. 현재 접속
   - `https://dusanserver.webhop.me/`
7. 남은 일
   - 실패 복구, 운영 runbook, quota/cost guardrail.

## 11. 읽기 대본

아래는 5분 정도로 읽을 수 있는 대본이다.

> 이번 작업의 목표는 단순한 화면 데모가 아니라, OpenStack 환경을 Environment 단위로 요청하고 OpenTofu로 실제 plan과 apply까지 수행하는 MVP를 만드는 것이었습니다.
>
> 처음에는 API, Runner, Web, OpenTofu 템플릿이 각각 존재했지만, 실제 운영 흐름으로 보면 Environment 요청이 Job으로 연결되고, Runner가 그 Job을 가져가 OpenTofu를 실행하고, 결과와 로그가 다시 API와 화면으로 돌아오는 경로가 핵심이었습니다.
>
> 현재는 Environment 생성 요청을 하면 API가 spec을 검증하고 MySQL에 Environment와 Job을 저장합니다. Runner는 MySQL queue에서 Job을 claim하고, 고정된 OpenTofu 템플릿에 검증된 변수를 주입해서 `init`, `validate`, `plan`을 실행합니다. Plan이 끝나면 admin이 승인하고, admin만 apply를 실행할 수 있습니다.
>
> Apply가 실행되면 Runner가 같은 plan artifact로 OpenTofu apply를 수행하고, outputs와 상태를 저장합니다. 실행 로그는 `.infra-orch/logs`에 남고, API의 log snapshot endpoint와 WebSocket stream으로 확인할 수 있습니다. Destroy도 같은 방식으로 plan, approval, apply 흐름을 탑니다.
>
> 실제 요청 처리를 위해 provider credential 저장과 Runner 연동도 구현했습니다. API에 저장된 OpenStack provider connection을 Runner가 읽어서 runtime `clouds.yaml`로 만들고, OpenTofu provider가 이 설정으로 OpenStack API에 접근합니다.
>
> 검증은 세 단계로 했습니다. 첫째, Go 테스트와 Web build로 코드 레벨을 확인했습니다. 둘째, Kubernetes prod overlay render와 pod/service/ingress 상태로 배포 구성을 확인했습니다. 셋째, API smoke, WebSocket smoke, real OpenStack smoke로 create, plan, approval, apply, log, destroy cleanup 흐름을 확인했습니다.
>
> 현재 외부 접속은 `https://dusanserver.webhop.me/`로 가능합니다. 이 경로는 bastion Nginx의 public 443을 통해 ingress-nginx로 들어가고, Web은 `/api`와 `/ws`를 API 서비스로 프록시합니다.
>
> 결론적으로 현재는 실제 시연 가능한 MVP 흐름은 연결되어 있습니다. 남은 과제는 실패 복구 UX, quota/cost guardrail, 장기 artifact 관리, 그리고 GitHub Actions, Jenkins, ArgoCD를 한 번에 확인할 수 있는 운영 runbook 정리입니다.

## 12. 예상 질문과 답변

### Q1. 지금 실제로 동작하나?

네. 현재 기준으로 Web/API 외부 접속이 가능하고, 코드상 Environment -> Job -> Runner -> OpenTofu 흐름이 연결되어 있다. Real OpenStack smoke script로 create/apply/destroy까지 검증할 수 있다.

### Q2. API 서버가 직접 OpenTofu를 실행하나?

아니다. API는 요청과 상태 저장을 담당하고, OpenTofu 실행은 별도 Runner가 담당한다.

### Q3. Apply는 누가 할 수 있나?

Admin만 할 수 있다. Plan approval도 admin gate를 통과해야 한다.

### Q4. 로그는 어디서 보나?

Job detail 화면, `GET /api/jobs/{id}/logs`, WebSocket `/ws`로 확인한다. Runner는 `.infra-orch/logs`에 로그 artifact를 남긴다.

### Q5. Credential은 어디에 있나?

문서에는 secret value를 넣지 않는다. Kubernetes `infra` namespace secrets, 저장된 provider connection, bastion/k8s-master 환경에서 확인해야 한다.

### Q6. 남은 가장 큰 리스크는?

OpenStack cloud 상태, quota, image/flavor availability, provider credential 정합성, 그리고 배포 파이프라인에서 GitHub Actions/Jenkins/ArgoCD 중 어디까지 반영됐는지 확인하는 운영 가시성이다.

## 13. 발표 전 체크리스트

발표 전에 아래만 확인하면 된다.

- `https://dusanserver.webhop.me/` 접속 확인
- `/healthz` 응답 확인
- `/api/public-config` 응답 확인
- admin login 확인
- provider preflight 확인
- Kubernetes pod 상태 확인
- ArgoCD/Jenkins 배포 상태 확인
- 가능하면 `smoke-openstack-existing-provider` 한 번 실행
- 실패 시 보여줄 screenshot 또는 smoke 결과 준비

