# Test Strategy

## Scope

This phase focuses on the backend contract surface that the web UI depends on:

- auth/session endpoints
- jobs create/list/get/apply flow
- environment validation
- CORS and auth middleware behavior

## Layers

### Unit tests

- `internal/validation`: required fields, instance count limits, invalid counts.
- `internal/security`: keep existing password/token tests as the baseline for auth helpers.
- `internal/renderer` and `internal/executor`: keep the existing coverage and expand only when behavior changes.

### Contract tests

- `internal/api`: request/response shapes for auth and job routes.
- `internal/api`: authorization gates for protected endpoints.
- `internal/api`: apply flow requires a done plan job and admin access.
- `internal/api`: CORS preflight and allowed-origin behavior.

### Integration-style tests

- `internal/storage/sqlite`: CRUD and claim behavior.
- later, `internal/storage/mysql`: parity tests once the MySQL package is repaired and stable.

## Test Matrix

| Area | What to verify | Current status |
| --- | --- | --- |
| Auth | signup/login/logout/me and cookie session behavior | missing |
| Jobs | create/list/get/apply and viewer payload | missing |
| Validation | environment naming and instance constraints | thin |
| Storage | CRUD and queue claim | covered for SQLite |
| Release | repeatable local verify entrypoint | missing |

## Running Strategy

### Local development

- `make fmt-check`
- `make test-contract`
- `make vet-contract`
- `make verify`

### CI

- run the same `make verify` target so local and CI stay aligned
- keep the release checklist as the final manual gate for a production rollout

## Known limitation

The repository currently has a separate MySQL package syntax failure outside this phase. Until that is fixed, the verify target intentionally focuses on the contract surface that is writable in this workstream.

