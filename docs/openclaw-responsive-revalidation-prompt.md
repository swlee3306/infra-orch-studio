# OpenClaw Prompt: Responsive Revalidation (390 / 768 / 1024)

아래 프롬프트를 그대로 OpenClaw에 전달해서 최근 UI 단순화 변경의 실제 효과를 재검증한다.

---

Infra Orch Studio의 최신 UI 단순화 변경을 기준으로 반응형/배율 재검증을 수행해줘.

검증 범위(우선순위):
- `/dashboard`
- `/environments`
- `/environments/:id`
- `/environments/:id/review`
- `/environments/:id/approval`

검증 뷰포트:
- `390x844` (mobile first)
- `768x1024` (tablet)
- `1024x768` (small laptop)

검증 배율:
- 기본 `100%`
- CSS zoom `90%`, `110%` (가능한 경우만)

환경:
- base URL: `http://infra-orch.example.com:30131`
- 계정: `admin@example.com / change-me`

핵심 목표:
1. `/dashboard`가 1-cycle 운영 시작 화면으로 충분히 단순한지 확인
2. `/environments` 목록이 핵심 4열 중심으로 읽기 쉬운지 확인
3. `/environments/:id`에서 보조 섹션(출력/감사/다음 운영 작업)이 기본 접힘 상태로 시작하는지 확인
4. CTA 접근성(검토/승인 제어/환경 상세 이동)이 390에서도 below-fold 과다 누적 없이 유지되는지 확인
5. 버튼/타이틀/본문의 줄바꿈, 겹침, overflow, 잘림이 없는지 확인

필수 체크리스트:

공통
- 긴 텍스트가 카드 밖으로 튀어나오지 않는가
- 버튼이 버튼처럼 보이고 클릭 가능한 크기를 유지하는가
- 주요 제목/소제목이 비정상 세로 접힘 없이 읽히는가
- EN/KR 토글 후 레이아웃 붕괴가 없는가

`/dashboard`
- 상단 CTA가 `Create environment` 중심으로 명확한가
- 핵심 KPI 카드가 3개 축(검토 대기 / 승인완료-적용대기 / 실패실행)으로 보이는가
- 불필요한 보조 패널이 first screen을 밀어내지 않는가

`/environments`
- 필터가 단일 상태 선택(select)으로 동작하는가
- 표가 `환경 / 라이프사이클 / 최근 실행 / 다음 단계` 중심으로 표시되는가
- 행 정보 스캔 비용이 이전보다 줄어든 것으로 보이는가

`/environments/:id`
- `출력(Artifacts/Outputs)` 기본 접힘인지
- `감사 타임라인` 기본 접힘인지
- `다음 운영 작업` 기본 접힘인지
- review/approval 진입 CTA가 모바일에서 접근 가능한 위치인지

`/environments/:id/review`
- 직접 approve/apply 버튼이 사라지고, approval control 진입 중심인지

`/environments/:id/approval`
- apply 라벨이 `Apply approved plan`(KR: `승인된 플랜 적용`)으로 표시되는지
- 비관리자 조건에서 disabled 이유 문구/툴팁이 일관적인지

실패 판단 기준(High):
- 390에서 핵심 CTA가 연속 2 screen 이상 아래에 밀려 초기 운영 판단이 불가
- 카드/텍스트 overflow 또는 겹침으로 핵심 정보 판독 불가
- 기본 접힘 정책(출력/감사/다음 운영 작업)이 깨짐

산출물 형식:
- `REPORT.md`
- `screenshot-files.txt`
- `screenshots/*`
- (가능하면) `zoom-css/*`

저장 경로:
- `/home/sulee/infra-orch-studio-E2E-snapshot/<timestamp>__responsive-revalidation-simplification/`

REPORT.md 상단 필수 항목:
- 테스트한 git commit SHA
- 총 케이스 수 / Pass / Fail
- High/Medium/Low 이슈 수
- blocker 요약 (없으면 `none`)
- 이전 배치 대비 변화 요약(특히 `/environments/:id` scan cost)

---

참고:
- 이전 결과 로그: `docs/ui-revalidation-log.md`
- 단순화 계획: `docs/usage-simplification-plan.md`
