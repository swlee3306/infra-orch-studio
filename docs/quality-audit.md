# Quality Audit

## Current State

The repository already has a clear split between API, runner, renderer, executor, storage, and a small React UI. The strongest parts are the domain model boundaries and the SQLite repository tests. The weakest parts are the contracts at the API boundary and the release gate around the whole system.

### What is already covered

- Renderer workdir creation is tested.
- Executor wrapper error handling is tested.
- SQLite create, update, list, and claim behavior is tested.
- Environment validation exists and is small enough to harden with table-driven tests.

### Main gaps

- `internal/api` has no direct tests, so auth, jobs, apply, CORS, and session behavior are not pinned down.
- The frontend has no test coverage, so UI regressions are not guarded.
- The current CI only checks generic Go formatting/vet/test and does not encode a practical contract test suite.
- The repo currently has a blocking MySQL package syntax issue outside this phase; that must be fixed by the backend workstream before the full repository build can be trusted again.

## Risk Areas

1. API contract drift between UI and backend.
2. Job lifecycle regressions around `queued -> running -> done/failed`.
3. Auth/session regressions that break the web UI.
4. Storage behavior differences between SQLite and MySQL.
5. Release steps that succeed locally but fail in cluster because no service-level checklist exists.

## Quality Bar

- API endpoints should have direct handler tests for success and failure paths.
- Validation should use table-driven tests for missing and invalid environment input.
- Verification should have a single local entrypoint and the same entrypoint in CI.
- Release readiness should be documented as a checklist, not tribal knowledge.

## Priority

1. Pin the API/auth/job contract with tests.
2. Add a single verify script and wire it into Makefile and CI.
3. Document release gates and rollback expectations.
4. Add UI tests in the next phase when the frontend toolchain is writable.

