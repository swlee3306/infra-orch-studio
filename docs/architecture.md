# Architecture

## Goal
"Environment 단위 인프라 오케스트레이션 플랫폼"을 구축한다.

- 사용자 입력(웹 폼/템플릿/향후 채팅) → **도메인 모델**
- 도메인 모델 → OpenTofu 실행 입력(템플릿 + 변수)
- runner/worker가 OpenTofu plan/apply 실행
- 초기 provider: OpenStack
- 배포: 개인 Kubernetes

## Non-goals (초기)
- 복잡한 멀티 환경/멀티 테넌트 권한 시스템
- 다양한 provider 지원(구조는 열어두되 구현은 OpenStack 1개)
- 고성능/대규모 동시 실행

## Components
### API service
- 책임: 요청 수신/검증, job 생성, 상태/로그 조회
- 무거운 provisioning(=tofu 실행)은 **절대 동기 실행하지 않음**

### Runner service
- 책임: job 픽업, 렌더링, OpenTofu 실행(plan/apply), 결과 저장

## Layers (packages)
- `internal/api`: HTTP handlers + DTO + environment lifecycle routes
- `internal/domain`: OpenTofu와 독립적인 도메인 모델
- `internal/validation`: 입력 검증
- `internal/renderer`: domain → tofu vars + template wiring
- `internal/executor`: tofu 실행 래퍼 (stdout/stderr 수집)
- `internal/storage`: environment/job/audit/auth metadata 저장

## Storage choice
- 현재 운영 진입점은 **MySQL** 이다.
  - API와 runner가 동일한 메타데이터 백엔드를 공유한다.
  - 환경 상태, 승인 메타데이터, audit event, retry/artifact reference를 MySQL에 저장한다.
- SQLite 저장소는 테스트와 로컬 경량 시나리오에 남아 있지만, 운영 기본 경로는 아니다.

## OpenTofu templates strategy
- "고정된 모듈/템플릿 + 동적 변수 주입"을 원칙으로 한다.
- 초기에는 `templates/opentofu/environments/basic` 아래의 루트 템플릿을 기준으로 한다.

## State strategy
- Environment/Job 단위로 state를 분리한다.
- MySQL은 lifecycle/auth/audit의 source of truth다.
- runner PVC/workdirs는 plan/apply/log artifact 보관용이다.
