# Unit Test Results

Generated: `2026-04-15T04:37:56Z`

## Environment Assumptions

- Repository root: `/home/sulee/infra-orch-studio`
- Toolchain: Go 1.25 series as declared in [`go.mod`](../go.mod)
- Commands were executed from the repo root.
- The local sandbox blocked plain shell execution with a `bwrap: loopback: Failed RTM_NEWADDR` error, so the test commands were re-run with escalated execution to obtain real results.

## Commands Executed

1. `make fmt-check`
2. `go test ./internal/security ./internal/validation ./internal/domain ./internal/renderer ./internal/executor ./internal/runtimecheck ./internal/storage ./internal/storage/sqlite`
3. `go test ./internal/api ./internal/api/handlers`
4. `go test ./cmd/api ./cmd/runner`
5. `make verify`
6. `go test ./internal/storage/mysql`
7. `go test ./...`

## Lane Results

| Lane | Command | Result | Notes |
| --- | --- | --- | --- |
| Format gate | `make fmt-check` | Pass | Returned `bash hack/verify.sh fmt` and exited 0. |
| Core unit packages | `go test ./internal/security ./internal/validation ./internal/domain ./internal/renderer ./internal/executor ./internal/runtimecheck ./internal/storage ./internal/storage/sqlite` | Pass | All required core packages passed. `internal/security` and `internal/storage` have no test files. |
| API unit packages | `go test ./internal/api ./internal/api/handlers` | Pass | `internal/api` passed; `internal/api/handlers` has no test files. |
| Entrypoint tests | `go test ./cmd/api ./cmd/runner` | Pass | Both startup/wiring packages passed. |
| Stable repo gate | `make verify` | Pass | fmt, vet, unit tests, and kustomize validation all passed. |
| Quarantined storage lane | `go test ./internal/storage/mysql` | Pass | Package is green in the current tree. |
| Full repo sweep | `go test ./...` | Pass | Repository-wide sweep passed after the MySQL lane was verified green. |

## Evidence Summary

- No test failures were observed in any executed lane.
- `make verify` completed the kustomize validation for:
  - `k8s/app/base`
  - `k8s/app/overlays/dev`
  - `k8s/app/overlays/stage`
  - `k8s/app/overlays/prod`

## Recommended Next Actions

- Keep the current lane order as the default unit-test sequence.
- Promote `internal/storage/mysql` into the normal pass set now that it is green again.
- Add a frontend unit-test harness before moving `web/src` into this matrix.
