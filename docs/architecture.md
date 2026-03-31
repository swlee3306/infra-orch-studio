# Architecture (MVP)

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
- `internal/api`: HTTP handlers + DTO
- `internal/domain`: OpenTofu와 독립적인 도메인 모델
- `internal/validation`: 입력 검증
- `internal/jobs`: job state machine / orchestration
- `internal/renderer`: domain → tofu vars + template wiring
- `internal/executor`: tofu 실행 래퍼 (stdout/stderr 수집)
- `internal/provider/openstack`: OpenStack 전용 domain→vars 매핑 보조/제약
- `internal/storage`: job metadata/log storage

## Storage choice (MVP)
- 기본은 **sqlite**를 1순위로 고려.
  - 이유: API/runner 분리 시 파일 기반(JSON)은 동시성/조회/무결성이 빠르게 복잡해짐.
  - K8s에서는 PV 하나로 해결 가능.

## OpenTofu templates strategy
- "고정된 모듈/템플릿 + 동적 변수 주입"을 원칙으로 한다.
- 초기에는 `templates/opentofu/environments/basic` 아래의 루트 템플릿을 기준으로 한다.

## State strategy (초기 방향)
- Environment/Job 단위로 state를 분리한다.
- Backend는 Phase 8에서 (local/PV, 또는 object storage 등) 선택지를 문서화한다.
