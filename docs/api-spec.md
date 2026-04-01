# API Spec

## Conventions
- All responses are JSON unless stated otherwise.
- Error shape: `{ "error": "<message>" }`
- Timestamps use RFC3339 or RFC3339Nano as serialized by Go.

## Authentication

### `POST /api/auth/signup`
- Body:
```json
{ "email": "admin@example.com", "password": "change-me" }
```
- Behavior:
  - creates a user
  - starts a session
  - returns the created user

### `POST /api/auth/login`
- Body:
```json
{ "email": "admin@example.com", "password": "change-me" }
```
- Behavior:
  - validates credentials
  - starts a session
  - returns the user

### `POST /api/auth/logout`
- Clears the session cookie and deletes the stored session.

### `GET /api/auth/me`
- Auth required.
- Returns the current user.

## Jobs

### Job object
```json
{
  "id": "uuid",
  "type": "environment.create | tofu.plan | tofu.apply",
  "status": "queued | running | done | failed",
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-01T00:00:00Z",
  "environment": { "...": "..." },
  "template_name": "basic",
  "workdir": "/abs/path",
  "plan_path": ".infra-orch/plan/plan.bin",
  "source_job_id": "uuid",
  "error": "message"
}
```

### `POST /api/jobs`
- Auth required.
- Body:
```json
{
  "type": "environment.create",
  "environment": {
    "environment_name": "dev",
    "tenant_name": "tenant-a",
    "network": { "name": "net1", "cidr": "10.0.0.0/24" },
    "subnet": { "name": "sub1", "cidr": "10.0.0.0/24", "enable_dhcp": true },
    "instances": [
      { "name": "vm1", "image": "ubuntu-22.04", "flavor": "m1.small", "count": 1 }
    ]
  }
}
```
- `type` defaults to `environment.create`.
- `tofu.apply` is rejected here.
- `tofu.plan` is accepted for advanced clients, but `POST /api/jobs/:id/plan` is the preferred derived-job route.
- `environment.network.cidr` and `environment.subnet.cidr` are required.

### `GET /api/jobs?limit=50`
- Auth required.
- Returns:
```json
{ "items": [/* jobs */], "viewer": { "id": "...", "email": "..." } }
```
- `limit` is capped server-side.

### `GET /api/jobs/:id`
- Auth required.
- Returns a single job or 404.

### `POST /api/jobs/:id/plan`
- Auth required.
- Creates a new queued `tofu.plan` job derived from the source job.
- The new job copies the source environment and stores `source_job_id`.
- Runner executes the plan asynchronously.

### `POST /api/jobs/:id/apply`
- Auth required.
- Admin only.
- Source job must be a completed `tofu.plan` job with `workdir` and `plan_path`.
- Creates a new queued `tofu.apply` job derived from that plan job.

## WebSocket

### `GET /ws`
- Auth required.
- Client message:
```json
{ "type": "subscribe", "jobId": "uuid" }
```
- Server messages:
```json
{ "type": "status", "jobId": "uuid", "status": "running", "error": "" }
{ "type": "log", "jobId": "uuid", "file": "tofu-plan.stdout.log", "message": "..." }
{ "type": "error", "message": "..." }
```

## Job Lifecycle
- `environment.create` and `tofu.plan` jobs are rendered by the runner, initialized, planned, and then marked `done` or `failed`.
- `tofu.apply` jobs reuse the source plan's workdir and plan artifact, then execute `tofu apply`.
- Runner-owned status transitions are:
  - `queued` -> `running`
  - `running` -> `done | failed`
