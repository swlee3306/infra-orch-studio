# Backend Audit

## Scope
- Read: `cmd/api`, `cmd/runner`, `internal/api`, `internal/domain`, `internal/storage`, `internal/validation`, `internal/executor`, `internal/renderer`
- Goal: identify backend refactor points for an environment-oriented orchestration platform

## Current Structure
- `internal/domain/environment.go` defines a provider-agnostic `EnvironmentSpec`.
- `internal/domain/job.go` models execution units and currently carries both desired state and execution metadata.
- `internal/api/jobs.go` exposes job creation, derived plan creation, and admin-only apply.
- `cmd/runner/main.go` owns the execution loop and translates jobs into renderer/executor calls.
- `internal/storage` is job-centric and persists jobs, users, and sessions only.
- `internal/executor` writes command output to workdir-local log files and returns exit metadata.
- `internal/renderer` maps `EnvironmentSpec` into OpenTofu template variables.

## What Works
- API and runner are separated at the process boundary.
- OpenTofu stays behind a fixed template + variable injection layer.
- The domain model is still mostly OpenTofu-agnostic at the environment layer.
- Derived plan and apply jobs exist, which is a good foundation for asynchronous orchestration.
- Workdir-based log files already give a usable execution trail for local debugging.

## Gaps
### Environment vs Job
- The platform still behaves like a job system with environment payloads attached, not like an environment lifecycle platform.
- `Job` carries too much state: desired environment, template name, workdir, plan path, source link, and error text.
- There is no first-class `Environment` aggregate for create/update/destroy lifecycle or ownership/history.

### Approval Flow
- `POST /api/jobs/:id/apply` is admin-only, but that is authorization, not approval.
- There is no explicit approval record, approval status, approver identity, or approval timestamp.
- Apply depends on a completed plan job, but the system does not model review/approval of plan outputs before apply.

### Audit Log
- There is no audit subsystem.
- The only durable trace is `job.error` plus files under `.infra-orch/logs/`.
- The system cannot answer who approved, who retried, who destroyed, or when a lifecycle step happened without correlating logs manually.

### Retry / Failure Handling
- Failures are terminal: runner marks a job failed and stops.
- No retry count, retry policy, backoff, or partial-failure recovery exists.
- `runner` does not distinguish transient failures from permanent ones.
- There is no explicit rollback/retry orchestration for failed `apply` or failed `init/plan`.

### Artifact / State Management
- The DB stores `workdir`, `plan_path`, and `error`, but not structured outputs, artifact checksums, or log references.
- Logs live in the filesystem only.
- There is no artifact model for `plan.json`, `outputs.json`, `stdout/stderr`, or execution summaries.
- State backend strategy is not modeled beyond implicit workdir persistence.

### API Naming / Spec Mismatch
- `POST /api/jobs` accepts `environment.create` and `tofu.plan`, but the resource name is still `jobs`, not `environments`.
- `POST /api/jobs/:id/plan` creates a derived plan job, which is a useful mechanism, but the API still lacks a first-class environment lifecycle surface.
- `GET /api/jobs/:id` exposes execution metadata, not environment state or lifecycle state.
- README/API docs still read like an MVP job queue, while the implementation now implies plan/apply orchestration and environment lifecycle semantics.

## Risks
- The current data model makes future environment update/destroy awkward because the system has no durable lifecycle root besides a job row.
- Approval and audit requirements will be hard to add cleanly if they continue to live inside `Job`.
- Retry support will be brittle without a separate execution attempt model.
- File-based logs and implicit state paths will make operational support and retention policies difficult.
- The backend contract already diverges from the MVP docs, so any further UI/ops work risks widening the gap unless the domain is clarified first.

## Recommendations
### P0
1. Introduce a first-class `Environment` aggregate and keep `Job` as an execution attempt.
2. Add explicit approval records and require approval before `apply`.
3. Add audit logging for create, plan, approve, apply, retry, update, and destroy.
4. Add retry metadata and failure categorization on jobs or execution attempts.
5. Formalize artifact references for plan, outputs, logs, and execution summaries.

### P1
1. Rename and reshape API resources toward environments, plans, approvals, and executions.
2. Add environment update/destroy lifecycle APIs.
3. Add output retrieval APIs backed by persisted artifact metadata.
4. Split operational concerns from execution concerns in storage.

### P2
1. Add drift detection and reconciliation.
2. Add a conversational interface only after the environment lifecycle contract is stable.

## Modified Files
- `docs/backend-agent-audit.md`
