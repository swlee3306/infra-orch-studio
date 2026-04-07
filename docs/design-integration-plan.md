# Design Integration Plan

`design/infra-Ocrhestration.pen`를 이 프로젝트의 공식 UI/UX 소스로 사용한다. 이 파일에는 초기 `Screen Suite`와 더 정제된 `Infra Orchestration SaaS v2`가 함께 들어 있으며, 실제 구현 기준은 `v2`를 우선으로 잡는다.

## 1. 디자인 화면 목록

### v2 기준 화면

1. `Zone A - Dashboard + Environment List`
   - 운영 대시보드
   - 환경 목록
   - approval / failure / lifecycle KPI
2. `Zone B - Environment Detail`
   - 환경 메타데이터
   - 상태/리소스/최근 작업/outputs/logs/audit
   - 위험 액션 계층
3. `Zone C - Create + Plan Review`
   - 다단계 환경 생성 flow
   - plan review 및 risk acknowledgement
4. `Zone D - Approval + Update/Destroy`
   - approval control
   - destructive safeguard
   - final confirmation chain
5. `Zone E - Job Detail + Templates`
   - job execution detail
   - retry / rerun / linked records
   - template surface
6. `Zone F - Audit + Future Chat`
   - audit 중심 화면
   - future chat / operator assistance placeholder

## 2. 현재 구현 화면 목록

1. `/login`
2. `/dashboard`
   - 운영 대시보드
   - lifecycle / approval / failure KPI
3. `/environments`
   - environment 중심 목록
   - quick create rail
   - search / lifecycle summary
4. `/create-environment`
   - 다단계 create wizard
   - template selection / staged validation / review preview
5. `/environments/:id`
   - 환경 상세
   - update plan / review / approval / retry / destroy
   - outputs / artifacts / audit / recent jobs
6. `/environments/:id/review`
   - plan review
   - risk signals / impact summary / approval comment
7. `/environments/:id/approval`
   - approval control
   - guarded apply / destroy flow
8. `/jobs`
   - raw execution ledger
   - legacy raw plan create
9. `/jobs/:id`
   - job detail
   - websocket logs / linked environment / artifacts
10. `/templates`
   - template catalog
   - template/module inspect + validate
11. `/audit`
   - 전역 environment audit feed

## 3. 일치하는 부분

- 제품 철학은 이미 environment 중심으로 이동했다.
- `Environment -> Plan -> Approval -> Apply -> Result -> Audit` 흐름을 API에서 표현할 수 있다.
- environment detail에 approval, retry, outputs, audit, destroy 액션이 존재한다.
- jobs는 하위 execution ledger로 분리되어 있어 디자인 방향과 충돌하지 않는다.

## 4. 부족한 부분

- template management는 inspect/validate까지 왔지만 edit/apply 같은 고급 관리 기능은 없다.
- drift detection은 아직 화면과 API가 없다.
- chat assistance는 create wizard 안의 `request chat (beta)` draft 생성 수준까지 반영됐지만, multi-turn assistant나 정책 질의응답 단계는 아직 없다.
- legacy `/jobs` 화면은 운영 주 경로라기보다 하위 execution ledger 성격이 강하다.

## 5. 새로 구현해야 할 부분

### P0

- Dashboard 신설
- Environment List를 대시보드와 같은 디자인 시스템으로 재구성
- Environment Detail을 디자인의 information architecture에 맞춰 재구성

### P1

- Create Environment wizard
- Plan Review 화면
- Approval control 화면

### P2

- Job Detail을 디자인 기준으로 재배치
- Template management
- Dedicated Audit 화면
- Destroy flow confirmation 강화
- request chat beta 고도화

## 6. 현재 코드와 디자인 매핑

### Zone A -> `/dashboard`, `/environments`

- 디자인 의도
  - 전체 운영 posture를 먼저 보여주고
  - 그 아래에서 환경 목록과 approval/failure queue를 본다.
- 현재 상태
  - `/dashboard`와 `/environments`로 분리되어 있고 environment 중심 요약이 반영되어 있다.
- 반영 방향
  - 현재 구조 유지
  - 이후 drift signal이나 approval SLA 같은 운영 지표를 추가 가능

### Zone B -> `/environments/:id`

- 디자인 의도
  - 환경이 1급 객체로 보이고
  - metadata, resources, recent jobs, outputs, audit, guarded actions가 한 화면에 있다.
- 현재 상태
  - metadata, recent jobs, outputs/artifacts, audit, guarded actions 구조까지 반영되어 있다.
- 반영 방향
  - update plan 편집 UX를 create wizard와 더 강하게 통합하는 정도의 개선 여지가 남아 있다.

### Zone C -> new create/plan review flow

- 디자인 의도
  - 단계형 생성 flow
  - plan review에서 high-risk / low-risk / impact summary 구분
- 현재 상태
  - create wizard와 plan review가 별도 화면으로 분리되어 있다.
  - create wizard 1단계에 자연어 요청을 structured draft로 바꾸는 `request chat (beta)` 패널이 들어가 있다.
- 반영 방향
  - 현재 구조 유지
  - 향후 server-side validation 범위를 더 넓히는 개선 가능

### Zone D -> new approval/mutation screen

- 디자인 의도
  - control checkpoint와 destructive safeguard를 분리
- 현재 상태
  - approval control과 guarded destroy flow가 별도 화면으로 분리되어 있다.
- 반영 방향
  - 현재 구조 유지
  - approval policy 세분화가 필요한지 추가 검토

## 7. 화면별 Gap 분석

### Dashboard

- 현재 구현 있음
- 필요한 것
  - drift, cost, SLA 같은 추가 운영 지표는 향후 확장 가능

### Environment List

- 현재 environment 중심 목록과 quick create rail이 있음
- 부족한 것
  - 더 정교한 ops filter, saved view 같은 고급 기능은 없음

### Environment Detail

- 현재 overview/resources/recent jobs/outputs/audit/guarded actions 구조가 반영됨
- 부족한 것
  - drift signal, richer artifact preview 같은 심화 기능은 없음

### API / 상태 구조 보완 제안

- `checkpoint states`
  - Zone D 수준 UX를 위해 추가 정교화 가능
- `request draft parsing`
  - 현재는 deterministic parsing 기반이므로 multi-turn clarification은 아직 없다.

### 현재 반영된 API

- `GET /api/environments/:id/jobs`
  - 환경별 최근 작업 목록 조회용
- `GET /api/environments/:id/plan-review`
  - review signal, impact summary, current plan job 조회용
- `POST /api/environments/plan-review-preview`
  - create wizard의 사전 review signal, impact summary, preview template 조회용
- `GET /api/environments/:id/artifacts`
  - workdir, plan_path, outputs, last plan/apply job 조회용
- `GET /api/audit`
  - 전역 환경 audit feed 조회용
- `GET /api/templates`
  - repo-backed template catalog 조회용
- `GET /api/templates/:kind/:name`
  - selected template/module inspect 조회용
- `POST /api/templates/:kind/:name/validate`
  - renderer contract 기준 validate 실행용
- `POST /api/request-drafts`
  - 자연어 요청을 create wizard용 structured draft로 바꾸는 beta endpoint

## 8. 수정 우선순위

1. P0 Dashboard
2. P0 Environment List
3. P0 Environment Detail
4. P1 Create Flow
5. P1 Plan Review
6. P1 Approval
7. P2 Job Detail / Templates / Audit / Destroy

## 9. 이번 턴 구현 범위

- `docs/design-integration-plan.md` 작성
- Dashboard 신설
- 공통 콘솔 레이아웃 반영
- Environment List P0 반영
- Environment Detail P0 반영
- Create Environment wizard
- Plan Review 화면
- Approval Control 화면
- 환경 상태 기반 review / approval 진입 링크 정리
- 빌드 검증

## 10. 최종 상태 표기 기준

- 디자인 반영 완료
  - P0/P1 화면이 `.pen` 정보 구조와 시각 언어를 반영하고 실제 API 상태와 연결됨
- 디자인 반영 미완료
  - 일부 P2 고급 기능은 아직 없음
- 추가 필요 사항
  - drift detection
  - request chat beta를 policy-aware assistant로 확장할지 범위 정리

## 11. 현재 반영 상태

- 완료
  - P0 `Dashboard / Environment List / Environment Detail`
  - P1 `Create Environment Flow / Plan Review / Approval`
  - 상태 기반 진입 흐름 `dashboard -> environments -> detail -> review -> approval`
  - create wizard review가 `plan-review-preview` API를 사용하도록 정렬되어 review 기준이 create 이후 화면과 일치
  - create wizard가 단계별 validation gate와 실제 `security refs` 입력을 제공하여 마지막 review 단계에 오류가 몰리지 않도록 정리
- 부분 완료
  - P2 `Job Detail`을 environment-linked execution view로 재구성
  - P2 `Dedicated Audit` 화면 추가
  - P2 `Template Management`는 repo-backed catalog 조회와 template/module inspect + validate까지 반영
  - `Destroy Flow polish`는 admin-only + typed confirmation payload + audit comment metadata까지 반영
  - `Request chat (beta)`는 create wizard 안에서 structured draft 생성까지 반영
- 미완료
  - template edit/apply 같은 고급 관리 기능은 아직 없음
- 추가 필요 사항
  - drift detection
  - request chat은 아직 draft generation까지만 지원하고 multi-turn assistant는 없음
