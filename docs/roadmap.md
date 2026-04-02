# Roadmap

> Historical snapshot: 초기 MVP 단계별 로드맵 기록이다. 현재 서비스화 우선순위는 `docs/design-integration-plan.md`, `docs/operations-guide.md`, `docs/release-checklist.md`와 함께 다시 읽어야 한다.

## Phase 0
- 탐색/계획 (DONE)

## Phase 1: Repository bootstrap
- 디렉터리 구조 생성
- `go.mod`, `cmd/api`, `cmd/runner` 최소 골격 (빌드 가능)
- README/architecture/roadmap 업데이트

## Phase 2: Go API skeleton
- `/healthz`
- `/jobs` create/get/list (storage MVP 포함)
- domain + validation 도입

## Phase 3: Runner skeleton
- job pickup loop
- renderer/executor/storage 인터페이스 정의

## Phase 4: OpenTofu templates
- OpenStack network/subnet/instance
- sample vars/tfvars

## Phase 5: Rendering
- domain → tofu vars
- 안전한 workdir 생성

## Phase 6: Plan
- `tofu init`, `tofu plan`
- stdout/stderr 수집 (workdir 파일 저장 → 이후 DB 메타데이터로 확장)
- plan artifact path 메타데이터 저장

## Phase 7: Apply
- 명시적 요청에서만 apply
- apply는 plan job을 참조하여 실행 (`POST /jobs/{id}/apply` 등)
- outputs/state 안전장치

## Phase 8: Kubernetes deploy
- manifests/helm
- config/secret/PV 문서화

## Phase 9: E2E verify
- 실제 OpenStack all-in-one 대상 1개 예시 성공
