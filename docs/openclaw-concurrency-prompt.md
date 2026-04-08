# OpenClaw Prompt: Concurrency / Smart Retry Revalidation

아래 프롬프트를 그대로 OpenClaw에 전달해서 동시성 충돌/재시도 UX를 배치 검증한다.

---

Infra Orch Studio의 환경 변경 동시성 보호(revision precondition, conflict auto-refresh, smart retry)를 E2E로 재검증해줘.

검증 범위:
- /environments/:id/review
- /environments/:id/approval
- /environments/:id

목표:
1) 동시 탭(세션)에서 같은 환경을 동시에 조작할 때 stale mutation이 성공하지 않는지 확인
2) 충돌 시 UI가 자동 새로고침되고 conflict delta(revision/status/last job 변화)가 보이는지 확인
3) Retry last action이 최신 revision으로 재시도되는지 확인
4) 폼 입력(approval comment, destroy comment, typed confirmation, desired state 편집값)이 충돌 후에도 유지되는지 확인

환경:
- base URL: http://infra-orch.example.com:30131
- 계정: admin@example.com / change-me

시나리오 A (Plan conflict):
1. 같은 environment를 Tab A/B에서 연다.
2. Tab A에서 update plan 큐잉.
3. refresh 없이 Tab B에서 같은 update plan 큐잉.
4. Tab B에서 아래를 확인:
   - conflict 에러 문구
   - 자동 재조회
   - conflict delta callout
   - Retry last action 버튼
5. Tab B에서 Retry last action 클릭 후 결과 확인.

시나리오 B (Approve/apply conflict):
1. pending_approval 상태 환경을 Tab A/B에서 연다.
2. Tab A approve 실행.
3. Tab B stale approve 실행 -> conflict 처리 확인.
4. Tab A apply 실행.
5. Tab B stale apply 실행 -> conflict 처리 + retry 확인.

시나리오 C (Destroy conflict):
1. approval 화면 Tab A/B 오픈, typed confirmation 모두 입력.
2. Tab A destroy plan 큐잉.
3. Tab B stale destroy 큐잉.
4. conflict 처리 + retry 확인.

필수 수집:
- 각 시나리오별 before/after 스크린샷
- console error/warn
- 네트워크 요청/응답(특히 409 응답과 retry 후 재요청)
- 최종 판정(Pass/Fail + 남은 이슈)

산출물 형식:
- REPORT.md
- screenshot-files.txt
- screenshots/*
- 필요시 request-response-snippets.md

저장 경로:
/home/sulee/infra-orch-studio-E2E-snapshot/<timestamp>__concurrency-smart-retry/

완료 후 REPORT.md 상단에 아래를 명시:
- 테스트한 git commit SHA
- 총 시나리오 수 / Pass / Fail
- blocker 요약 (없으면 "none")

---

참고:
- 상세 시나리오 기준 문서: `docs/concurrency-smoke-checklist.md`

