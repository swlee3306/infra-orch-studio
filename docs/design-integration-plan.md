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
2. `/environments`
   - 환경 목록
   - 즉시 생성 폼
3. `/environments/:id`
   - 환경 상세
   - update plan / approve / apply / retry / destroy
   - outputs / audit
4. `/jobs`
   - raw execution ledger
   - legacy raw plan create
5. `/jobs/:id`
   - job detail
   - websocket logs

## 3. 일치하는 부분

- 제품 철학은 이미 environment 중심으로 이동했다.
- `Environment -> Plan -> Approval -> Apply -> Result -> Audit` 흐름을 API에서 표현할 수 있다.
- environment detail에 approval, retry, outputs, audit, destroy 액션이 존재한다.
- jobs는 하위 execution ledger로 분리되어 있어 디자인 방향과 충돌하지 않는다.

## 4. 부족한 부분

- 대시보드가 없다.
- 운영 콘솔 레이아웃과 시각 언어가 `.pen` 디자인과 다르다.
- environment list가 단순 표 수준이라 lifecycle / approval / risk posture를 충분히 보여주지 못한다.
- environment detail이 존재하지만, 디자인이 기대하는 overview/resources/recent jobs/outputs/audit 구조가 더 필요하다.
- create flow와 plan review는 화면적으로 분리되어 있지 않다.
- approval / destroy guard는 별도 제어 화면이 아니라 버튼 액션 수준이다.
- templates / dedicated audit 화면은 아직 없다.

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

## 6. 현재 코드와 디자인 매핑

### Zone A -> `/dashboard`, `/environments`

- 디자인 의도
  - 전체 운영 posture를 먼저 보여주고
  - 그 아래에서 환경 목록과 approval/failure queue를 본다.
- 현재 상태
  - `/environments` 하나에 목록과 생성 폼이 같이 있다.
- 반영 방향
  - `/dashboard` 신설
  - `/environments`는 richer list + filter + quick create rail로 재구성

### Zone B -> `/environments/:id`

- 디자인 의도
  - 환경이 1급 객체로 보이고
  - metadata, resources, recent jobs, outputs, audit, guarded actions가 한 화면에 있다.
- 현재 상태
  - 핵심 액션은 있으나, 정보 구조가 설계 도면보다 약하다.
- 반영 방향
  - overview cards, recent jobs, outputs/artifacts, audit timeline, safe action hierarchy로 확장

### Zone C -> new create/plan review flow

- 디자인 의도
  - 단계형 생성 flow
  - plan review에서 high-risk / low-risk / impact summary 구분
- 현재 상태
  - 즉시 생성 + 즉시 plan queue
- 반영 방향
  - 현재는 quick create 유지
  - 이후 dedicated wizard + plan review screen 추가

### Zone D -> new approval/mutation screen

- 디자인 의도
  - control checkpoint와 destructive safeguard를 분리
- 현재 상태
  - approve/apply/destroy가 detail action button 수준
- 반영 방향
  - 현재 detail에 위험 액션 계층을 먼저 반영
  - 이후 dedicated approval screen 추가

## 7. 화면별 Gap 분석

### Dashboard

- 현재 구현 없음
- 필요한 것
  - KPI cards
  - pending approvals panel
  - failed execution panel
  - lifecycle summary
  - environment snapshot table

### Environment List

- 현재 표와 생성 폼은 있음
- 부족한 것
  - 운영 중심 필터
  - search
  - approval/failure emphasis
  - quick create rail
  - lifecycle stage summary

### Environment Detail

- 현재 액션과 audit는 있음
- 부족한 것
  - recent jobs list
  - richer metadata cards
  - outputs/artifacts grouping
  - safe action hierarchy
  - overview/resources/job/audit 구조 강조

### API / 상태 구조 보완 제안

- `checkpoint states`
  - Zone D 수준 UX를 위해 추가 정교화 가능

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
  - P0 화면이 `.pen` 정보 구조와 시각 언어를 반영하고 실제 API 상태와 연결됨
- 디자인 반영 미완료
  - P2 전용 화면은 아직 없음
- 추가 필요 사항
  - plan review / approval 전용 API 계약 강화

## 11. 현재 반영 상태

- 완료
  - P0 `Dashboard / Environment List / Environment Detail`
  - P1 `Create Environment Flow / Plan Review / Approval`
  - 상태 기반 진입 흐름 `dashboard -> environments -> detail -> review -> approval`
  - create wizard review가 `plan-review-preview` API를 사용하도록 정렬되어 review 기준이 create 이후 화면과 일치
- 부분 완료
  - P2 `Job Detail`을 environment-linked execution view로 재구성
  - P2 `Dedicated Audit` 화면 추가
  - P2 `Template Management`는 repo-backed catalog 조회 화면까지 반영
  - `Destroy Flow polish`는 admin-only + typed confirmation payload + audit comment metadata까지 반영
- 미완료
  - template edit/validate/apply 같은 고급 관리 기능은 아직 없음
- 추가 필요 사항
  - approval workflow 정책 강제 수준 검토
