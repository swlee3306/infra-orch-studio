# Quality Audit

## Core Diagnosis

The repository has a working baseline for build, API, runner, and UI, but the quality system is still MVP-grade rather than service-grade.

The strongest signals are:

- `make verify` exists and is wired into `CI`, but it validates only a narrow Go package set and deliberately skips `internal/storage/mysql`.
- The runner has a simple claim loop and logs command failures, but it does not model retries, attempt counts, backoff, or rollback semantics.
- `plan` and `apply` are now separated at the API boundary, but there is no dedicated integration test coverage for the end-to-end state transitions across API, storage, runner, and artifacts.
- The web image and API image workflows are push/build automation, not quality gates. They are operational release jobs, not validation jobs.

The result is a system that can run, but can still fail silently in the places that matter most for production use: plan/apply state transitions, artifact persistence, and operational recovery.

## What Is Good

- The codebase now has explicit `plan` and `apply` job paths instead of overloading a single work unit.
- `make verify` provides a repeatable local contract gate.
- There are unit tests for API auth, job routes, environment validation, executor behavior, and SQLite storage.
- The runner persists stdout/stderr per run under workdir logs, which gives us a concrete artifact location to test against.

## Main Gaps

### 1. Coverage is still package-oriented, not workflow-oriented

Current tests mostly verify individual handlers or storage operations in isolation. The missing layer is a lifecycle test that exercises:

- create environment job
- create plan job
- runner claims and executes plan
- apply is blocked until plan is done
- apply can only target an approved/done plan
- logs and artifacts are persisted where the API/UI expects them

Without that, a change can pass unit tests while still breaking the production path.

### 2. Retry and failure handling are underspecified

The runner marks jobs `failed` on command failure, but there is no:

- retry count
- retry policy
- failure classification
- transient vs permanent error distinction
- idempotency guard for re-run of partially completed jobs

This means failures become terminal too early, and operators have to manually reconstruct state when a run dies mid-flight.

### 3. Rollback is not modeled

There is no explicit rollback path for:

- failed `plan` generation
- failed `apply` after partial resource creation
- workdir cleanup after cancellation or crash
- artifact cleanup for abandoned jobs

For infra orchestration, that is a production gap. A failed apply can leave drift or partially created resources behind, but the platform does not yet describe how it detects or surfaces that state.

### 4. CI is still not a full service gate

The current `CI` workflow runs `make verify`, which is good for contract checks, but it does not:

- run a web build
- execute `go test ./...` as a whole repo gate
- verify plan/apply lifecycle behavior with a realistic integration harness
- exercise failure-path assertions

The release workflows also mutate image tags on `main`, which is operationally useful but not a substitute for validation.

### 5. The MySQL runtime path is still under-validated

SQLite tests exist and are useful, but the production runtime uses MySQL. That means the storage path that matters most is still mainly exercised by build-time checks rather than runtime integration tests.

## P0 Validation Strategy

P0 validation should be layered, with each layer catching a different class of regression.

### Layer 1: Fast contract gate

Run on every PR and main push:

- `go test ./...`
- `make verify`
- `cd web && npm run build`

Purpose:

- catch syntax, compile, and handler regressions quickly
- ensure UI remains buildable
- keep local contract behavior reproducible

### Layer 2: Lifecycle tests

Add integration-style tests for:

- `POST /api/jobs`
- `POST /api/jobs/{id}/plan`
- `POST /api/jobs/{id}/apply`
- `GET /api/jobs/{id}`
- job claim and state transitions in runner

Assertions should cover:

- plan requires a valid environment
- apply is rejected until the source plan job is `done`
- apply is rejected for non-admin users
- derived jobs keep the source job linkage
- failed jobs surface the runner error string

### Layer 3: Artifact and log checks

Test the following artifacts explicitly:

- plan file path exists after plan completion
- stdout/stderr logs are written to the expected workdir location
- the API returns artifact metadata that matches the runner output

### Layer 4: Failure-path harness

Add tests or scripted checks that simulate:

- missing tofu binary
- invalid environment spec
- plan command failure
- apply command failure
- source plan missing when apply starts
- runner restart after job has already been claimed

## Failure Scenarios To Cover

- Invalid environment input should fail before job creation or before runner execution, depending on the layer.
- A `plan` job should fail if rendering or `tofu init` fails.
- A `plan` job should fail if `tofu plan` exits non-zero, and the error should remain attached to the job.
- An `apply` job should fail if its source plan is not `done`.
- An `apply` job should fail if the plan artifact is missing or the workdir is invalid.
- A runner crash after claim but before persistence should not create duplicate execution without an explicit retry policy.

## Retry And Rollback Gap

The current gap is structural, not just missing code.

- Retry does not exist as a first-class domain concept.
- The runner cannot distinguish "retryable" from "terminal" failures.
- There is no retry budget or queue re-entry logic.
- Rollback is not an API contract, so it is impossible to tell the UI when a job can be safely re-attempted versus when a human must inspect the cluster.

That means the right production move is not to fake rollback, but to make failure state explicit and auditable:

- store attempt count
- store failure class
- store source job linkage
- store artifact paths
- expose clear operator actions for retry, cancel, and destroy

## Recommendations

1. Make lifecycle validation the primary quality gate, not just package-level unit tests.
2. Add runner-level failure tests for init/plan/apply and missing artifact cases.
3. Extend CI to run the full repo test suite and web build on PRs.
4. Add retry metadata before implementing any automatic retry behavior.
5. Model rollback as an explicit operator workflow, not an implicit side effect.

## Files Reviewed

- [README.md](/home/sulee/infra-orch-studio/README.md)
- [.github/workflows/ci.yml](/home/sulee/infra-orch-studio/.github/workflows/ci.yml)
- [.github/workflows/api-ci.yml](/home/sulee/infra-orch-studio/.github/workflows/api-ci.yml)
- [.github/workflows/web-ci.yml](/home/sulee/infra-orch-studio/.github/workflows/web-ci.yml)
- [Makefile](/home/sulee/infra-orch-studio/Makefile)
- [internal/api/jobs.go](/home/sulee/infra-orch-studio/internal/api/jobs.go)
- [cmd/runner/main.go](/home/sulee/infra-orch-studio/cmd/runner/main.go)
- [internal/executor/executor.go](/home/sulee/infra-orch-studio/internal/executor/executor.go)
- [internal/storage/mysql/store.go](/home/sulee/infra-orch-studio/internal/storage/mysql/store.go)
- [internal/storage/auth.go](/home/sulee/infra-orch-studio/internal/storage/auth.go)
- [internal/domain/job.go](/home/sulee/infra-orch-studio/internal/domain/job.go)
- [internal/api/auth_test.go](/home/sulee/infra-orch-studio/internal/api/auth_test.go)
- [internal/api/jobs_test.go](/home/sulee/infra-orch-studio/internal/api/jobs_test.go)
- [internal/validation/environment_test.go](/home/sulee/infra-orch-studio/internal/validation/environment_test.go)
- [internal/storage/sqlite/store_test.go](/home/sulee/infra-orch-studio/internal/storage/sqlite/store_test.go)
- [internal/storage/sqlite/claim_test.go](/home/sulee/infra-orch-studio/internal/storage/sqlite/claim_test.go)
