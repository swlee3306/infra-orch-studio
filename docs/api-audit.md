# API Audit

## Current Shape
- Active HTTP entrypoint is `internal/api/*`.
- Auth uses session cookies and MySQL-backed users/sessions.
- Jobs are persisted through the shared storage interface and executed asynchronously by the runner.
- The current contract now includes `POST /api/jobs/:id/plan` and `POST /api/jobs/:id/apply`.

## What Was Good
- API, runner, renderer, and executor responsibilities are already separated.
- Job state is persisted and can be observed through `GET /api/jobs/:id` and WebSocket updates.
- The API returns consistent JSON error payloads.

## Gaps Found
- A legacy `internal/api/handlers/*` package still exists alongside the active `internal/api/*` implementation. It is not wired into `cmd/api`, which makes the routing surface harder to reason about.
- The previous codebase documented a plan route but did not implement it. That gap is now closed in the active API path.
- Validation was still MVP-shaped: fixed instance-count limits, missing CIDR checks, and weak request hardening.
- Session cookies did not explicitly support secure transport.
- WebSocket access is authenticated, but there is still no per-user ownership model for jobs, so authorization is coarse.

## Service-Level Risks Remaining
- Job ownership is not modeled, so any authenticated user can inspect any job.
- The MySQL store still uses the `mysql` CLI rather than a native driver, which keeps runtime dependencies brittle.
- Log streaming is file-tail based and assumes runner-local workdirs.
- There is no pagination or filtering on job listing beyond a capped limit.

## Recommended Direction
- Keep the active API path in `internal/api/*` as the only production router.
- Treat `internal/api/handlers/*` as legacy code to be retired after the next cleanup pass.
- Add job ownership and richer state/artifact metadata in the next backend iteration.
