# Current State Diagnostic

> Historical snapshot: 이 문서는 environment lifecycle, approval, audit, retry, dashboard, plan review, template inspect/validate가 도입되기 전후의 진단 기준선으로 남긴 기록이다. 현재 계약은 `docs/api-spec.md`, `docs/operations-guide.md`, `docs/design-integration-plan.md`, `docs/documentation-map.md`를 우선 본다.

이 문서는 현재 리포지토리의 구현 현실을 기준으로 작성한 진단 보고서다. 목적은 “무엇이 이미 동작하는지”, “어디가 MVP에 머물러 있는지”, “실서비스로 가려면 무엇이 먼저 필요한지”를 분리해 보는 것이다.

## 1. 현재 시스템 요약

프로젝트는 OpenStack 환경을 OpenTofu로 생성·관리하는 오케스트레이션 플랫폼이다. 구조적으로는 API 서비스와 runner가 분리되어 있고, API는 job 생성/조회와 인증을 담당하며 runner가 OpenTofu init/plan/apply를 실행한다.

현재 구현에서 실제로 확인되는 흐름은 다음과 같다.

- 가입/로그인/세션 발급
- job 생성 및 job 목록/상세 조회
- runner의 job claim, init, plan, apply 수행
- WebSocket을 통한 job 상태 및 로그 스트리밍
- Kubernetes 기본 매니페스트와 GitHub Actions CI

## 2. 현재 코드 현실

문서와 코드가 완전히 일치하지는 않는다. 특히 다음 차이는 중요하다.

- README와 아키텍처 문서는 `plan/apply`를 명시하지만, API 라우팅은 `POST /jobs/{id}/apply`만 실제로 연결되어 있고 `POST /jobs/{id}/plan`은 구현되어 있지 않다.
- 문서는 sqlite를 1순위로 설명하지만, 현재 실행 진입점은 MySQL을 필수로 요구한다.
- UI는 로그인, 잡 목록, 잡 상세 조회만 제공하며 환경 생성/plan/apply를 유도하는 운영 화면은 없다.
- 배포 매니페스트는 단일 이미지와 inline env 중심이며 dev/stage/prod 분리나 운영 변수 관리가 약하다.

## 3. 구현된 것

- 인증
  - 이메일/비밀번호 가입 및 로그인
  - httpOnly cookie 세션
  - admin seed/upsert 경로
- job lifecycle
  - environment.create / tofu.plan / tofu.apply 타입 정의
  - queued / running / done / failed 상태 정의
  - runner의 queued job claim
  - plan 결과를 workdir에 저장하고 apply가 이를 참조
- rendering/execution
  - 고정 템플릿 + 변수 주입 모델
  - OpenTofu init/plan/apply 래퍼
  - stdout/stderr 로그 파일 저장
- UI
  - 로그인/회원가입 화면
  - job 목록/상세 화면
  - WebSocket 기반 로그 스트리밍

## 4. 부족한 부분

### 제품/기획

- 환경 객체의 수명주기와 job 수명주기가 분리되어 있지 않다.
- 승인 흐름이 없다. apply는 admin only라고 적혀 있지만 UI/API 수준에서 승인 대기, 승인자, 승인 이력, 재시도 정책이 없다.
- 실패 후 복구 시나리오가 약하다. plan 실패, apply 실패, workdir 누락, plan artifact 유실에 대한 운영 가이드가 없다.

### 화면/UI

- 운영자가 사용할 수 있는 생성/검토/승인/재실행 화면이 없다.
- job 상세는 상태와 로그만 보여 주며 plan 결과, 입력값, artifact 경로, 다음 행동이 보이지 않는다.
- 빈 상태, 에러 상태, 권한 부족 상태의 UX가 없다.

### API/백엔드

- `POST /jobs/{id}/plan`가 없다.
- job 상태 전환에 대한 명시적 state machine이 없다.
- 승인 전용 apply, idempotency, retry, audit trail, artifact 보존 정책이 없다.
- auth/session/role과 job action 권한이 느슨하게 결합되어 있다.

### 검증

- 비정상 시나리오 테스트가 부족하다.
- plan/apply 실패와 재시도, artifact 없음, source job mismatch 같은 케이스가 없다.
- release checklist와 OpenStack 실환경 사전 검증 절차가 부족하다.

### 배포/운영

- API/runner/web 설정 분리 수준이 낮다.
- workdir/state/log 보존 정책이 명시되어 있지 않다.
- readiness/liveness, resource limit, secret/config 분리, rollout 절차가 약하다.

## 5. 실서비스 관점 리스크

1. 사용자는 무엇을 해야 하는지 UI만 보고 이해하기 어렵다.
2. apply가 운영상 가장 민감한 동작인데 승인/감사/재시도 체계가 없다.
3. runner가 생성한 workdir와 plan artifact에 운영 의존성이 높지만 보존 정책이 없다.
4. MySQL 필수라는 사실이 문서와 코드에서 분리되어 있어 초기 설정 실패 가능성이 높다.

## 6. 결론

현재 시스템은 “기술적으로는 동작하는 MVP”지만, “운영 가능한 서비스”로 보기에는 다음이 빠져 있다.

- 명시적 plan/apply 승인 흐름
- 운영자 중심 UI
- 예외 복구와 감사 가능한 상태 관리
- 배포/설정/보존 정책의 문서화

다음 작업은 기능 추가보다 먼저 제품 흐름과 운영 흐름을 문서와 backlog로 고정하는 것이 맞다.
