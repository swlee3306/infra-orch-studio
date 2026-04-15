# Repo Unit Test Plan

> Planning document for the repository's unit-test lane. This is not a historical snapshot of a completed release; it is the working plan for how to run and judge unit coverage at the repo level.

## Goal

Establish a repeatable unit-test sequence for the Go backend and the web package, with clear scope boundaries, execution order, pass criteria, failure triage, and output locations.

## Scope By Package / Module

| Package / module | Responsibility | Unit-test focus | Current status |
| --- | --- | --- | --- |
| `internal/security` | Password/token helpers | Hashing, verification, token handling | Required in the default lane |
| `internal/validation` | Environment input validation | Required fields, counts, invalid shapes | Required in the default lane |
| `internal/domain` | Domain state transitions | Lifecycle rules, status transitions, invariants | Required in the default lane |
| `internal/renderer` | Workdir rendering and copy logic | Template copy, workdir layout, invalid paths | Required in the default lane |
| `internal/executor` | OpenTofu command wrapper | Command arguments, log handling, error paths | Required in the default lane |
| `internal/runtimecheck` | Template/runtime preflight checks | Required asset detection and path validation | Required in the default lane |
| `internal/storage` | Shared storage interfaces/errors | Interface-level behavior and sentinels | Required only when interface logic changes |
| `internal/storage/sqlite` | SQLite repository implementation | CRUD, claim behavior, persistence edge cases | Required in the default lane |
| `internal/api` | HTTP API behavior | Auth, jobs, environments, middleware, websocket helpers | Required in the default lane |
| `internal/api/handlers` | Handler adapters | Request routing and response shaping | Required in the default lane |
| `cmd/api` | API bootstrap | Startup validation and wiring | Required in the default lane |
| `cmd/runner` | Runner bootstrap | Claim loop setup, plan/apply wiring, workdir paths | Required in the default lane |
| `internal/storage/mysql` | MySQL repository implementation | SQL generation and repository parity | Separate lane until package health is restored |
| `web/src` | React UI source | No unit-test harness is currently defined | Out of scope for this plan today |

## Execution Order

Run the lanes in this order so failures are localized early and higher-level tests do not hide lower-level breakage.

1. Format gate:

```bash
make fmt-check
```

2. Core library packages:

```bash
go test ./internal/security ./internal/validation ./internal/domain ./internal/renderer ./internal/executor ./internal/runtimecheck ./internal/storage ./internal/storage/sqlite
```

3. API packages:

```bash
go test ./internal/api ./internal/api/handlers
```

4. Entrypoint packages:

```bash
go test ./cmd/api ./cmd/runner
```

5. Repository gate for the stable Go surface:

```bash
make verify
```

6. Quarantined storage lane, only when the package is expected to be green:

```bash
go test ./internal/storage/mysql
```

7. Broader repository sweep, only after the MySQL lane is restored and intentionally brought back into the default pass set:

```bash
go test ./...
```

## Expected Pass Criteria

The unit-test plan is considered passing when all required lanes above exit with status 0 and the following conditions hold:

- Each modified package is covered by at least one targeted command from the required lane.
- No package in the default lane is skipped because of a known compile error or transient dependency issue.
- `make fmt-check` reports no `gofmt` drift.
- `internal/api` tests confirm auth/session, job, environment, and middleware behavior without requiring a live network dependency.
- `internal/renderer`, `internal/executor`, and `cmd/runner` tests validate path handling against the repo's artifact conventions, especially `.infra-orch/plan` and `.infra-orch/logs`.
- Any command in the required lane completes without panics, uncontrolled retries, or environment-specific failures.

## Failure Triage Checklist

Use this sequence when a lane fails.

1. Identify the exact command and package that failed.
2. Read the first failure line before digging into the full output.
3. Decide whether the failure is:
   - compile-time
   - assertion mismatch
   - fixture/setup problem
   - environment dependency problem
   - artifact/path mismatch
4. If the failure is in `internal/storage/mysql`, confirm whether the package is still in the quarantined state before spending time on downstream symptoms.
5. If the failure is in `internal/api`, check the test helper setup, request cookies, mocked store state, and any path-specific assertions.
6. If the failure is in `internal/renderer`, `internal/executor`, or `cmd/runner`, inspect workdir creation and log-path expectations first.
7. If the failure mentions missing plan or log artifacts, verify the expected runtime locations:
   - `workdirs/<job-id>/`
   - `workdirs/<job-id>/.infra-orch/plan/plan.bin`
   - `workdirs/<job-id>/.infra-orch/logs/*.log`
8. Re-run only the failing package command after the minimal fix, not the whole suite.

## Artifact Locations

The plan distinguishes between test output and runtime artifacts.

| Output type | Location | Notes |
| --- | --- | --- |
| Test command stdout/stderr | Terminal or CI log | Primary source for unit-test failures |
| Optional coverage file | `./coverage.out` or a CI-owned path | Only when coverage is explicitly collected |
| Runner logs from runtime-style tests | `workdirs/<job-id>/.infra-orch/logs/*.log` | Matches the product's log tailing behavior |
| Plan artifact from runner-style tests | `workdirs/<job-id>/.infra-orch/plan/plan.bin` | Used by apply and artifact checks |
| Rendered workdir contents | `workdirs/<job-id>/` | Useful for path assertions and fixture inspection |

## Concrete Run Matrix

| Lane | Command | Expected result | Artifact / evidence |
| --- | --- | --- | --- |
| Format gate | `make fmt-check` | No formatting drift | CI or terminal log only |
| Core unit packages | `go test ./internal/security ./internal/validation ./internal/domain ./internal/renderer ./internal/executor ./internal/runtimecheck ./internal/storage ./internal/storage/sqlite` | All packages pass | Terminal or CI log; any generated workdir artifacts remain under `workdirs/` |
| API unit packages | `go test ./internal/api ./internal/api/handlers` | All HTTP tests pass | Terminal or CI log |
| Entrypoint tests | `go test ./cmd/api ./cmd/runner` | Startup and wiring tests pass | Terminal or CI log |
| Stable repo gate | `make verify` | fmt, vet, unit tests, and kustomize checks pass for the stable surface | Terminal or CI log |
| Quarantined storage lane | `go test ./internal/storage/mysql` | Pass only after package health is restored | Terminal or CI log; SQL or fixture diagnostics if applicable |
| Full repo sweep | `go test ./...` | Pass only after the quarantined MySQL lane is re-admitted | Terminal or CI log |

## Notes

- This plan intentionally keeps the default lane aligned with `hack/verify.sh` and the current stable Go packages.
- The web package is tracked separately because no frontend unit-test harness is defined in this repository yet.
- If a future change adds a frontend test runner, document its command and artifact path here before promoting it into the default lane.
