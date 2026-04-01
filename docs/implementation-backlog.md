# Implementation Backlog

이 백로그는 현재 코드 현실을 기준으로 공통 문제를 모으고, 사용자 가치와 운영 안정성을 우선으로 정렬한 구현 계획이다.

## 1. 공통 문제점

1. `plan/apply`가 문서와 코드에서 일관되게 표현되지 않는다.
2. 운영자가 사용할 화면이 부족해서 API를 직접 만져야 한다.
3. 승인 흐름과 감사 흐름이 없다.
4. 실패/재시도/복구 시나리오가 문서와 테스트에 없다.
5. 배포 설정이 dev 수준에 머물러 있고 운영 파라미터가 흩어져 있다.

## 2. 우선순위

### P0

- `POST /jobs/{id}/plan` 구현과 API/문서 정합성 회복
- job 상태 전환과 승인 흐름 정의
- 운영자가 이해할 수 있는 사용자 플로우 문서화
- 실패 시나리오와 최소 검증 추가

### P1

- UI에서 environment/job/plan/apply 흐름을 보이게 만들기
- plan 결과, source job, artifact, 권한 상태 표시
- apply 승인 확인과 실패 복구 동작 추가

### P2

- 배포 매니페스트의 config/secret/state 분리
- 운영 가이드와 release checklist 보강
- rollback/retry/observability 문서화

## 3. 충돌 없는 구현 순서

1. 문서 정합성부터 고정한다.
2. API의 `plan` 및 승인 흐름을 먼저 명확히 한다.
3. 그 다음 UI가 그 API를 드러내도록 만든다.
4. 마지막으로 배포와 검증을 운영 수준으로 올린다.

이 순서는 파일 충돌을 줄이기 위해 다음처럼 나뉜다.

- 문서 작업: `docs/product-gap-analysis.md`, `docs/service-roadmap.md`, `docs/user-flow.md`, `docs/current-state-diagnostic.md`
- 제품/백엔드 작업: API 및 domain, storage, runner
- UI 작업: `web/src/*`
- 배포 작업: `deployments/k8s/*`, `k8s/*`
- 검증 작업: `internal/*_test.go`, `web/*`, `.github/workflows/*`

## 4. 파일 단위 작업 계획

### 문서 우선

- `docs/current-state-diagnostic.md`
  - 현재 코드와 문서의 차이, 리스크, 다음 단계 기준점
- `docs/product-gap-analysis.md`
  - 사용자/운영 격차, 승인 흐름, 예외 흐름
- `docs/service-roadmap.md`
  - 단계별 완료 기준, 릴리스 게이트
- `docs/user-flow.md`
  - 생성/plan/apply/승인/실패 복구 플로우

### API/백엔드

- `internal/api/handlers/jobs.go`
  - create/list/find 경로 유지
- `internal/api/handlers/apply.go`
  - apply 생성 전 승인 조건과 상태 점검 강화
- `internal/api/handlers/jobs_router.go`
  - plan/apply 라우팅 정리
- `internal/api/server.go`
  - route exposure 정합성 점검
- `internal/domain/job.go`
  - 승인/artifact/result 관련 필드 확장
- `internal/storage/*`
  - job claim, artifact metadata, audit-friendly 저장

### UI

- `web/src/pages/Login.tsx`
- `web/src/pages/Jobs.tsx`
- `web/src/pages/JobDetail.tsx`
- `web/src/api.ts`
  - plan/apply/create 흐름과 상태 표현 개선

### 배포/운영

- `deployments/k8s/*.yaml`
- `k8s/app/**`
- `k8s/mysql/**`
  - secret/config/state 분리, probe, resource, rollout 기준 보강

### 검증

- `internal/*_test.go`
- `.github/workflows/*.yml`
  - 실패 시나리오와 plan/apply 안전성 검증 추가

## 5. 구현 목표

최종적으로는 다음 상태를 목표로 한다.

- 사용자는 환경 생성 요청부터 plan 검토, apply 승인, 실행 결과 확인까지 한 흐름으로 이해할 수 있다.
- 운영자는 job 상태와 로그뿐 아니라 승인 상태, source job, artifact 유무, 실패 이유를 바로 판단할 수 있다.
- 배포는 API/runner/web 설정이 분리되고, 운영 환경에서 재현 가능한 방식이어야 한다.
