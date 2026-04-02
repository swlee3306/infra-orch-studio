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

## Environments

### Environment object
```json
{
  "id": "uuid",
  "name": "dev-a",
  "status": "planning | pending_approval | approved | applying | active | destroying | destroyed | failed",
  "operation": "create | update | destroy",
  "approval_status": "not_requested | pending | approved",
  "spec": { "...": "..." },
  "created_by_email": "operator@example.com",
  "approved_by_email": "admin@example.com",
  "approved_at": "2026-04-02T00:00:00Z",
  "last_plan_job_id": "uuid",
  "last_apply_job_id": "uuid",
  "last_job_id": "uuid",
  "last_error": "message",
  "retry_count": 0,
  "max_retries": 3,
  "workdir": "/abs/path",
  "plan_path": ".infra-orch/plan/plan.bin",
  "outputs_json": "{\"vm_ip\":{\"value\":\"10.0.0.10\"}}",
  "created_at": "2026-04-02T00:00:00Z",
  "updated_at": "2026-04-02T00:00:00Z"
}
```

### `GET /api/environments?limit=50`
- Auth required.
- Returns:
```json
{ "items": [/* environments */], "viewer": { "id": "...", "email": "..." } }
```

### `POST /api/environments`
- Auth required.
- Body:
```json
{
  "spec": {
    "environment_name": "dev-a",
    "tenant_name": "tenant-a",
    "network": { "name": "net1", "cidr": "10.0.0.0/24" },
    "subnet": { "name": "sub1", "cidr": "10.0.0.0/24", "enable_dhcp": true },
    "instances": [
      { "name": "vm1", "image": "ubuntu-22.04", "flavor": "m1.small", "count": 1 }
    ]
  },
  "template_name": "basic"
}
```
- Creates the environment aggregate and immediately queues the initial `tofu.plan` job.
- Returns `{ "environment": { ... }, "job": { ... } }`.

### `GET /api/environments/:id`
- Auth required.
- Returns a single environment or 404.

### `POST /api/environments/:id/plan`
- Auth required.
- Queues a plan for the target environment.
- Optional body:
```json
{
  "spec": { "...": "optional updated spec" },
  "operation": "update | destroy",
  "template_name": "basic"
}
```
- If no operation is provided, the server infers `create` or `update` from current lifecycle state.

### `POST /api/environments/:id/approve`
- Auth required.
- Admin only.
- Requires the latest plan job to be `done`.
- Marks the environment as approved and records approver metadata.

### `POST /api/environments/:id/apply`
- Auth required.
- Admin only.
- Requires `approval_status = approved`.
- Requires the latest plan artifact (`workdir`, `plan_path`) to be ready.
- Returns `{ "environment": { ... }, "job": { ... } }`.

### `POST /api/environments/:id/retry`
- Auth required.
- Requires the latest job to have failed and retry budget to remain.
- Returns `{ "environment": { ... }, "job": { ... } }`.

### `POST /api/environments/:id/destroy`
- Auth required.
- Queues a destroy plan for the environment.
- The destroy plan still requires approval before apply.

### `GET /api/environments/:id/audit`
- Auth required.
- Returns:
```json
{
  "items": [
    {
      "id": "uuid",
      "resource_type": "environment",
      "resource_id": "uuid",
      "action": "environment.approved",
      "actor_email": "admin@example.com",
      "message": "plan approved for apply",
      "metadata_json": "{\"plan_job_id\":\"uuid\"}",
      "created_at": "2026-04-02T00:00:00Z"
    }
  ]
}
```

## Jobs

### Job object
```json
{
  "id": "uuid",
  "type": "environment.create | tofu.plan | tofu.apply",
  "status": "queued | running | done | failed",
  "created_at": "2026-04-01T00:00:00Z",
  "updated_at": "2026-04-01T00:00:00Z",
  "environment_id": "uuid",
  "operation": "create | update | destroy",
  "environment": { "...": "..." },
  "template_name": "basic",
  "workdir": "/abs/path",
  "log_dir": "/abs/path/.infra-orch/logs",
  "plan_path": ".infra-orch/plan/plan.bin",
  "outputs_json": "{\"vm_ip\":{\"value\":\"10.0.0.10\"}}",
  "source_job_id": "uuid",
  "retry_count": 0,
  "max_retries": 3,
  "requested_by": "operator@example.com",
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
