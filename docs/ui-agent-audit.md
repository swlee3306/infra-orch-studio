# UI Agent Audit

> Historical snapshot: 이 문서는 environment-first UI 재구성 이전 감사 기록이다. 현재 구현 수준은 `docs/design-integration-plan.md`를 우선 기준으로 본다.

## Scope
- Target surfaces: `web/src/App.tsx`, `web/src/api.ts`, `web/src/pages/*`, `web/src/components/*`
- Backend contracts used by the UI: `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/:id`, `POST /api/jobs/:id/apply`, `GET /ws`
- Audience: operators who create environments, inspect plan/apply progress, and act on failures

## Current State
- The UI now has a recognizable operator console shape: login, jobs list, and job detail.
- Plan creation is exposed through the jobs page as a form that submits `POST /api/jobs` with `type: "tofu.plan"`.
- The detail page shows runtime metadata, a live log stream, and an admin-only apply action.
- Status is already rendered as badges instead of plain text, which is the right direction for operational readability.
- The shell is role-aware enough to hide auth-only surfaces from the login page.

## Core Diagnosis
- The product is still job-led in the UI even though the business model is environment-led.
- The jobs page is the operational entrypoint, but it does not yet present an environment lifecycle view.
- Approval is implied by the admin-only apply button, but it is not a first-class state or screen in the workflow.
- Failure handling is visible, but not yet actionable enough for a real operator.
- Logs are streamed, but the UI does not yet make them easy to scan, filter, or correlate with plan/apply phases.

## Findings
- `environment` is treated as form input and job payload, not as a first-class platform object with create/update/destroy lifecycle.
- The UI still assumes that a plan is just a job type, which hides the approval boundary between plan completion and apply authorization.
- There is no explicit approval state, approval audit, or approval history in the console.
- The detail page shows source job links and metadata, but it does not yet surface a clear execution timeline or phase transitions.
- Error UX is still text-centric; there is no structured next-step guidance for retry, re-run plan, or apply rejection handling.
- The log feed is readable enough for small runs, but it lacks grouping by phase, severity, and artifact source.
- The console does not yet distinguish environment summary from execution summary, which makes it harder to reason about the desired state versus the current run.

## UX Gaps
- No environment-centric navigation or overview screen.
- No plan approval step between plan completion and apply action.
- No dedicated review panel that explains what changed before apply.
- No retry affordance for transient failures or partial failures.
- No state badges for approval, drift, retryable failure, or blocked apply.
- No compact summary of outputs, artifacts, or plan file references.
- No environment lifecycle actions for update and destroy.

## Operational Gaps
- The UI does not explain how environment jobs map to plan/apply execution.
- The UI does not make it obvious which jobs are derived from which source environment or plan.
- There is no obvious distinction between “run failed” and “run failed but retryable”.
- Log output is still too close to raw tailing and too far from an operator-friendly activity feed.
- The current surface is not yet a SaaS-style console; it is closer to a job inspection tool.

## P0 Recommendations
- Make environment the primary noun in the UI and job the execution record underneath it.
- Introduce a visible approval boundary after plan completion and before apply.
- Add an execution summary section that shows what will be applied, what changed, and what remains blocked.
- Add retry and failure-state actions that are explicit rather than implied.
- Separate environment summary, approval state, execution state, and artifact state in the detail view.
- Keep using the current backend contract for plan creation, but represent it as an environment plan operation in the UI.

## Recommended Screen Model
- `Environment Overview`
- `Environment Detail`
- `Plan Review`
- `Approval`
- `Execution Detail`
- `Failure / Retry`

## Recommended Components
- `StatusBadge`
- `ApprovalBadge`
- `PhaseTimeline`
- `EnvironmentSummaryCard`
- `ArtifactPanel`
- `LogStream`
- `FailurePanel`
- `RetryActionBar`

## Recommended Navigation
- Jobs should remain accessible, but they should no longer feel like the top-level domain object.
- Environment detail should be the default landing surface for operators.
- Plan, approval, and apply should read as a single workflow with explicit gates.

## Summary
- The UI is good enough for MVP operations, but it is not yet an environment-centric SaaS console.
- The biggest gap is not visual polish; it is the absence of a first-class approval and lifecycle model in the UI.
- The next UI iteration should reorganize the console around environment state, execution phase, approval, and artifact visibility.

## Modified Files
- [docs/ui-agent-audit.md](/home/sulee/infra-orch-studio/docs/ui-agent-audit.md)
