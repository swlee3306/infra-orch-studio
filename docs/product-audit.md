# Product Audit

> Historical snapshot: 이 문서는 job-led MVP에서 environment-led 플랫폼으로 옮겨 가기 전 제품 진단 기록이다. 현재 제품 계약 문서가 아니라 개선 배경 자료로 읽어야 한다.

이 문서는 infra-orch-studio를 "environment 단위 인프라 오케스트레이션 플랫폼"으로 보기 위한 제품 진단이다. 핵심 관점은 현재 시스템이 job 중심인지, environment 중심인지, 그리고 사용자 흐름이 `environment -> plan -> approval -> apply -> result -> 운영`으로 닫혀 있는지 확인하는 것이다.

## 1. 현재 제품 구조 요약

현재 구현은 환경을 다루는 플랫폼처럼 보이지만 실제 운영 단위는 job이다.

- 사용자는 environment spec을 입력해 job을 만든다.
- runner는 job을 claim해서 plan/apply를 수행한다.
- job 상세 화면은 상태와 로그를 보여준다.
- approval은 명시적 개념이 아니라 admin 권한으로 apply를 막는 수준이다.

즉, "environment가 상위 개념이고 job은 실행 단위"라는 이상적인 구조보다는, "job을 중심으로 environment가 payload로 붙는 구조"에 가깝다.

## 2. 잘 된 점

- OpenTofu 실행이 API와 분리되어 있다.
- 고정 템플릿 + 변수 주입 원칙이 유지된다.
- environment spec 자체는 provider-agnostic 형태로 정의돼 있다.
- plan/apply와 WebSocket 로그 스트리밍이 이미 연결돼 있다.
- UI가 목록/상세/로그를 제공해 운영자가 현재 상태를 볼 수 있다.

## 3. 부족한 점

### Environment 중심 모델 부족

- environment 엔티티가 독립적인 라이프사이클을 갖지 않는다.
- update/destroy가 제품 기능으로 정의돼 있지 않다.
- create, plan, apply, destroy가 하나의 environment 맥락 안에서 추적되지 않는다.

### Approval Flow 부재

- apply는 admin only지만, 이것은 승인 워크플로가 아니다.
- 승인 대기, 승인자, 승인 사유, 승인 시각, 승인 이력, 승인 취소가 없다.
- plan 결과를 사람이 검토하고 승인하는 제품 흐름이 없다.

### Audit/Traceability 부족

- 누가 무엇을 언제 실행했는지 제품 차원에서 남는 audit log가 없다.
- job 상태와 시스템 로그는 있지만, 행위 이력과 의사결정 이력이 분리돼 있지 않다.

### Failure / Retry 설계 부족

- 실패 후 재시도 정책이 제품 기능으로 정의되지 않았다.
- 부분 실패, plan artifact 손실, workdir 재사용, destroy 실패 같은 운영 시나리오가 없다.

### State / Artifact 관리 부족

- plan 파일, output, logs, state의 보존 및 접근 정책이 명확하지 않다.
- 사용자는 artifact를 결과물로 보지 않고, 단순히 job status만 보게 된다.

## 4. 문서-코드 불일치

- README는 environment 중심 플랫폼을 말하지만 실제 UI/흐름은 job 목록 중심이다.
- 문서상 approval은 암묵적으로 기대되지만 코드상은 admin apply 제한뿐이다.
- roadmap은 plan/apply 이후의 lifecycle을 제시하지만 update/destroy, audit, retry가 빠져 있다.
- current-state 문서는 "동작하는 MVP"를 설명하지만 실서비스 제품 관점의 운영 단계는 아직 문서화되지 않았다.

## 5. 실서비스 리스크

1. 사용자는 무엇을 생성하고, 무엇을 승인하고, 무엇을 다시 실행해야 하는지 이해하기 어렵다.
2. admin 권한만으로 apply를 막으면 운영 안전성은 일부 확보되지만, 감사성과 협업성은 확보되지 않는다.
3. update/destroy가 없는 상태에서는 platform이 아니라 one-shot provisioning tool에 머문다.
4. 실패와 재시도가 제품으로 정의되지 않으면 운영자는 shell과 DB를 직접 만지게 된다.
5. artifact/state/log 정책이 느슨하면 plan/apply 이력과 실제 인프라 상태를 대응시키기 어렵다.

## 6. 권고안

### P0: 반드시 먼저 닫아야 하는 제품 기능

- approval flow를 별도 개념으로 도입한다.
- environment update/destroy lifecycle을 명시한다.
- audit log를 사용자 행위 기준으로 남긴다.
- retry / failure handling을 제품 정책으로 정의한다.
- 문서와 코드의 역할 경계를 다시 맞춘다.

### P1: 서비스화의 기본기

- environment 중심 UI를 만든다.
- template 관리와 output 활용 API를 분리한다.
- RBAC를 admin/operator 수준 이상으로 확장한다.

### P2: 확장 기능

- drift detection
- chat interface

## 7. 제품 모델 제안

권장하는 상위 모델은 다음과 같다.

- `Environment`: 사용자가 관리하는 대상. 수명주기와 상태를 가진다.
- `Plan`: Environment 변경안. 승인 전 검토 대상이다.
- `Approval`: 사람이 plan을 승인하는 행위와 그 메타데이터다.
- `Apply`: 승인된 plan을 실행하는 행위다.
- `Artifact`: plan file, output, logs, state reference를 묶는 결과물이다.
- `AuditEvent`: 누가 언제 무엇을 했는지 남기는 불변 이력이다.

이 모델에서는 job은 사용자에게 보이지 않는 실행 단위일 수 있지만, environment는 반드시 보여야 하는 제품 단위다.

## 8. 메인 에이전트가 바로 구현해야 할 P0 우선순위

1. approval flow: plan 후 승인 없이는 apply 금지.
2. environment lifecycle: update/destroy 포함.
3. audit log: 사용자 행위 중심 추적.
4. retry / failure handling: 재시도와 실패 복구 정책.
5. 문서-코드 정합성: API, UI, README, roadmap를 같은 흐름으로 맞춤.

## 9. 수정 대상 파일

- `docs/product-audit.md`
