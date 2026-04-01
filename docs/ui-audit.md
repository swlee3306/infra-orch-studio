# UI Audit

## Scope
- Target surfaces: `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/*`, `web/index.html`
- Audience: operators who create plan jobs, inspect status/logs, and decide when to apply

## Current State
- The UI only exposes login, job list, and job detail.
- The job list is a thin ID/type/status view with no operational summary.
- The detail page shows status and raw logs, but not a structured execution timeline or action panel.
- The login page is functional but visually minimal and does not explain password/session expectations.
- The UI already knows how to create jobs, but the primary plan flow is not presented as an operator-first action.

## Findings
- There is a contract gap between UI intent and backend implementation.
- `web/src/api.ts` exposes `jobs.plan(id)` even though the backend does not provide `/api/jobs/{id}/plan`.
- The backend does support `POST /api/jobs` with `type: "tofu.plan"`, so the UI should treat plan creation as a job creation path rather than a special endpoint.
- The job list response includes the viewer, but the current page does not use it to show operator context or admin affordances.
- The detail page subscribes to WebSocket events, but logs are appended as a single string and are hard to scan.
- Status is shown as plain text, which makes queued/running/done/failed state reading slower than it should be.
- The app shell is not role-aware and does not separate authenticated operator navigation from the login surface.

## UX Gaps
- No explicit environment-spec entry form for plan creation.
- No confirmation or validation summary before creating a plan job.
- No visible admin action for applying a completed plan job.
- No job summary cards, filters, or compact state counts.
- No structured log stream with file labels and incremental updates.
- No obvious source-job link from apply jobs back to the originating plan.

## Operational Gaps
- The UI does not clearly explain the expected password length or session cookie behavior.
- Errors are displayed as raw text without grouping or next-step guidance.
- There is no clear distinction between informational state, warning state, and failed state.

## Recommendation
- Reframe the job list page as the primary operator workspace.
- Make plan creation a first-class form that submits `POST /api/jobs` with `type: "tofu.plan"`.
- Add a status badge system and structured job metadata cards to the detail page.
- Keep the backend contract flexible by avoiding reliance on a dedicated plan endpoint.
- Keep the UI changes self-contained within `web/**` so backend work can follow independently.

