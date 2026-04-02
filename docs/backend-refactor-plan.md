# Backend Refactor Plan

> Historical snapshot: 이 문서는 초기 backend cleanup 계획 기록이다. 일부 항목은 이미 반영되었고, 남은 구조 개선은 현재 코드 기준으로 다시 평가해야 한다.

## Completed in This Patch
- Repaired the MySQL storage compile blocker.
- Added the missing derived plan route.
- Kept apply admin-gated and source-plan-based.
- Tightened request decoding, validation, and session cookie handling.
- Prefers an explicit template name on the runner when one is already stored on the job.

## Priority 1: Router Consolidation
- Keep `internal/api/*` as the production router.
- Retire `internal/api/handlers/*` after the next cleanup pass or wire it into a single router implementation.
- Ensure API docs and server routes stay in sync for `jobs`, `plan`, and `apply`.

## Priority 2: Job Model Hardening
- Add explicit ownership fields to jobs so authorization can move from coarse admin checks to resource-level checks.
- Split execution metadata from user-facing request data more cleanly.
- Add richer artifact references for plan output, logs, and future state snapshots.

## Priority 3: Storage Contract
- Reduce the MySQL CLI coupling when time allows.
- Introduce a native driver-backed storage implementation or a thin repository layer around the current backend.
- Preserve the shared `storage.Store` and `storage.AuthStore` contracts while the backend changes.

## Priority 4: Validation and Security
- Keep request validation close to the API boundary.
- Extend cookie/session hardening and consider proxy/TLS-aware deployment settings.
- Add explicit size limits and ownership checks for job payloads and WebSocket subscriptions.

## Priority 5: Operational Readiness
- Add a clear plan/apply operator flow in the UI and docs.
- Expand observability around runner executions and failed jobs.
- Track the minimum OpenStack verification checklist separately from unit tests.

## File Groups to Touch Next
- API/router: `internal/api/server.go`, `internal/api/jobs.go`, `internal/api/auth.go`, `internal/api/ws.go`.
- Storage: `internal/storage/mysql/store.go`, `internal/storage/storage.go`.
- Runner/rendering: `cmd/runner/main.go`, `internal/renderer/*`, `internal/executor/*`.
- Docs: `docs/api-spec.md`, `docs/api-audit.md`, `docs/backend-refactor-plan.md`.

## Notes
- The current codebase is already split well enough for incremental improvements.
- The next refactor should avoid changing template generation semantics unless the template set is updated in lockstep.
