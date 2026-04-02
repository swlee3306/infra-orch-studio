# Upgrade Backlog

## P0

- approval flow
  - plan 완료 후 `pending_approval`
  - 승인 전 apply 금지
- environment lifecycle
  - create / update / destroy 지원
  - environment를 1급 API 리소스로 승격
- audit log
  - 누가 / 언제 / 무엇을 실행했는지 저장
- retry / failure handling
  - 환경 단위 재시도 예산
  - 실패 시 environment 상태와 다음 액션 기록
- 문서-코드 정합성
  - environment 중심 API/도메인/UI/배포 문서 정렬

## P1

- environment 중심 UI
- template 관리
- output 활용 API
- RBAC

## P2

- drift detection
- chat interface

## 구현 순서

1. 도메인과 저장소에 `Environment`, `AuditEvent`, retry/artifact 필드 도입
2. environment API와 approval/apply/retry/destroy 액션 구현
3. runner를 environment 상태 머신과 artifact/output 저장에 연결
4. environment 중심 UI와 감사 뷰 추가
5. build/test/verify와 운영 문서 보강
