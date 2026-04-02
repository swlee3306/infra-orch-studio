# Upgrade Diagnostic

> Historical snapshot: 이 문서는 environment-first 전환 이전의 업그레이드 기준선을 기록한다. approval, audit, retry, destroy/update lifecycle, environment UI가 이미 구현된 현재 상태와는 일부 차이가 있다.

이 문서는 `infra-orch-studio`를 MVP에서 실서비스 수준의 환경 단위 오케스트레이션 플랫폼으로 끌어올리기 위한 기준선이다.

## 1. 현재 구조 요약

- `cmd/api`: 인증, 세션, job API, websocket 노출
- `cmd/runner`: queued job claim 후 OpenTofu init/plan/apply 실행
- `internal/domain`: provider-agnostic `EnvironmentSpec`, `Job`, `User`
- `internal/storage/mysql`: 현재 운영 경로인 MySQL 기반 메타데이터 저장
- `internal/executor`, `internal/renderer`: 고정 템플릿 + 변수 주입 기반 OpenTofu 실행
- `web`: 로그인, job 목록, job 상세 기반 운영 UI
- `k8s/app`, `k8s/mysql`: 운영 배포 매니페스트와 overlay

## 2. 잘 된 점

- API와 runner가 분리돼 있고 OpenTofu는 runner에서만 실행된다.
- 렌더링 계층이 도메인 모델과 OpenTofu 템플릿을 분리한다.
- plan/apply artifact를 workdir에 격리 저장한다.
- 기본 CI, health check, ingress, PVC, secret 분리까지는 이미 깔려 있다.

## 3. 부족한 점

- 실제 시스템의 주어는 `environment`가 아니라 `job`이다.
- `approval`, `audit`, `retry/failure handling`, `destroy/update lifecycle`가 없다.
- 상태는 `job` 문자열 수준에 머물고 `environment` 수명주기가 API와 UI에 드러나지 않는다.
- artifact, outputs, logs 정책이 코드상으로 충분히 명시되지 않았다.

## 4. 문서-코드 불일치

- README는 환경 단위 플랫폼을 설명하지만 실제 API는 `jobs` 중심이다.
- 현재 문서에는 운영 흐름이 있지만 실제 구현에는 approval/audit가 없다.
- 배포 문서는 개선되었지만 여전히 `deployments/k8s`와 `k8s/app` 이중 경로가 혼동을 유발한다.

## 5. 실서비스 리스크

- apply 이전 승인 체계 부재로 운영 사고 리스크가 높다.
- 실패 시 재시도 예산과 복구 흐름이 없어 운영자 판단이 임의적이다.
- environment 기준의 상태, 결과, 감사 이력이 없어 운영/감사 추적성이 낮다.
- ingress와 bastion 포워딩 경로는 Host 전제에 민감해 외부 접속 이슈가 잦다.

## 6. 핵심 진단

- 현재 시스템은 “job 실행기 + 운영 보조 UI”에 가깝다.
- 실서비스 SaaS 플랫폼으로 가려면 `Environment -> Plan -> Approval -> Apply -> Result -> Operations`를 API, 도메인, UI, 배포 문서에서 동일한 모델로 정렬해야 한다.
- 따라서 P0는 `Environment`를 1급 리소스로 분리하고, 그 위에 approval, audit, retry, artifact/state 관리를 올리는 것이다.
