# UI Improvement Plan

> Historical snapshot: job-led UI 개선 초안이다. 현재 UI 구현과 다음 단계는 `docs/design-integration-plan.md`를 우선 기준으로 본다.

## Goal
Make the current web app usable as an operator console for environment plan creation, execution monitoring, and apply approval.

## Priority Order
1. Plan creation flow
2. Job list readability
3. Job detail observability
4. Admin apply action
5. Authentication polish

## Phase 1: Minimum Operator Console
- Add a structured environment-spec form on the jobs page.
- Submit plan requests through `POST /api/jobs` with `type: "tofu.plan"`.
- Show job status using badges instead of plain text.
- Add summary cards for total jobs, queued/running/done/failed counts.
- Show viewer role and admin state in the header.

## Phase 2: Detail and Execution Visibility
- Expand the job detail page with metadata cards for type, status, source job, template, workdir, and plan path.
- Render logs as an ordered stream with file labels and time of arrival.
- Keep the WebSocket tailing behavior but present it as a readable activity feed.
- Add a clear error panel for failure states.

## Phase 3: Controlled Apply
- Show the apply action only when the viewer is admin and the source plan is `done`.
- Route apply to the existing `POST /api/jobs/{id}/apply` contract.
- After apply creation, navigate to the newly created apply job detail view.

## Phase 4: Authentication and Shell Polish
- Improve the login page copy, helper text, and state feedback.
- Make the shell role-aware so operator navigation appears only after authentication.
- Add shared styling tokens so the UI has consistent spacing, color, and state treatment.

## Proposed Web Changes
- `web/src/api.ts`
- `web/src/App.tsx`
- `web/src/main.tsx`
- `web/src/pages/Login.tsx`
- `web/src/pages/Jobs.tsx`
- `web/src/pages/JobDetail.tsx`
- `web/src/components/EnvironmentSpecForm.tsx`
- `web/src/components/StatusBadge.tsx`
- `web/src/styles.css`

## Constraints
- Do not depend on a dedicated backend plan endpoint.
- Treat plan creation as a normal job creation path with `type: "tofu.plan"`.
- Keep the UI resilient if future backend plan APIs are added later.
