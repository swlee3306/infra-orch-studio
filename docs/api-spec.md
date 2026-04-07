# API Spec

## Conventions
- All responses are JSON unless stated otherwise.
- Error shape: `{ "error": "<message>" }`
- Timestamps use RFC3339 or RFC3339Nano as serialized by Go.

## Authentication

### `POST /api/auth/signup`

This endpoint is available only when `ALLOW_PUBLIC_SIGNUP=true`.
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

### `POST /api/admin/users`
- Auth required.
- Admin only.
- Creates a user for managed onboarding when public signup is disabled.
- Body:
```json
{ "email": "operator@example.com", "password": "change-me-123", "is_admin": false }
```
- Returns the created user object.

### `GET /api/admin/users`
- Auth required.
- Admin only.
- Returns the current managed user inventory:
```json
{
  "items": [
    { "id": "uuid", "email": "admin@example.com", "is_admin": true, "created_at": "2026-04-07T00:00:00Z", "updated_at": "2026-04-07T00:00:00Z" }
  ]
}
```

## Request Drafts

### `POST /api/request-drafts`
- Auth required.
- Converts a natural-language operator request into a structured draft only.
- This endpoint does **not** create an environment, queue a plan, or bypass review/approval.
- Body:
```json
{ "prompt": "create a staging environment named payments-api for tenant finops with 2 ubuntu instances and web access" }
```
- Returns:
```json
{
  "prompt": "create a staging environment named payments-api for tenant finops with 2 ubuntu instances and web access",
  "template_name": "basic",
  "spec": {
    "environment_name": "payments-api",
    "tenant_name": "finops",
    "network": { "name": "vnet-payments-api", "cidr": "10.30.0.0/24" },
    "subnet": { "name": "snet-payments-api", "cidr": "10.30.0.0/25", "gateway_ip": "10.30.0.1", "enable_dhcp": true },
    "instances": [
      { "name": "payments-api-01", "image": "ubuntu-22.04", "flavor": "m1.medium", "ssh_key_name": "default", "count": 2 }
    ],
    "security_groups": ["sg-web"]
  },
  "assumptions": ["..."],
  "warnings": ["..."],
  "next_step": "Apply the generated draft to the wizard, then continue through plan review and approval.",
  "requires_review": true
}
```

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
- This route only supports `create` and `update`.
- Destroy plans must use `POST /api/environments/:id/destroy`.
- Optional body:
```json
{
  "spec": { "...": "optional updated spec" },
  "operation": "create | update",
  "template_name": "basic"
}
```
- If no operation is provided, the server infers `create` or `update` from current lifecycle state.

### `POST /api/environments/plan-review-preview`
- Auth required.
- Validates an in-progress desired-state payload without creating the environment aggregate.
- Request body:
```json
{
  "spec": {
    "environment_name": "prod-a",
    "tenant_name": "tenant-prod-us-03",
    "network": { "name": "net1", "cidr": "10.0.0.0/24" },
    "subnet": { "name": "sub1", "cidr": "10.0.0.0/25", "enable_dhcp": true },
    "instances": [
      { "name": "vm1", "image": "ubuntu-22.04", "flavor": "m1.small", "count": 2 }
    ],
    "security_groups": ["sg-web"]
  },
  "operation": "create",
  "template_name": "basic"
}
```
- Returns the same shape as `GET /api/environments/:id/plan-review` so create wizard review uses the same server-owned risk model as post-create review.

### `POST /api/environments/:id/approve`
- Auth required.
- Admin only.
- Requires the latest plan job to be `done`.
- Marks the environment as approved and records approver metadata.
- Optional body:
```json
{
  "comment": "approved after CAB review"
}
```

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
- Admin required.
- Queues a destroy plan for the environment.
- The destroy plan still requires approval before apply.
- Request body:
```json
{
  "confirmation_name": "prod-a",
  "comment": "sunset request CHG-42"
}
```
- `confirmation_name` must match the current environment name.

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

### `GET /api/environments/:id/jobs`
- Auth required.
- Returns environment-scoped execution records only.

### `GET /api/environments/:id/plan-review`
- Auth required.
- Returns:
```json
{
  "review_signals": [
    {
      "label": "Subnet capacity pressure",
      "detail": "Subnet 10.0.0.0/27 suggests limited remaining address space for future changes.",
      "severity": "high"
    }
  ],
  "impact_summary": {
    "downtime": "Medium",
    "blast_radius": "tenant-a / net-a / sub-a",
    "cost_delta": "Estimated footprint includes 4 instances and 0 security references."
  },
  "plan_job": { "...": "job object or null" }
}
```

### `GET /api/environments/:id/artifacts`
- Auth required.
- Returns:
```json
{
  "environment_id": "uuid",
  "workdir": "/abs/path",
  "plan_path": ".infra-orch/plan/plan.bin",
  "outputs_json": "{\"vm_ip\":{\"value\":\"10.0.0.10\"}}",
  "last_plan_job": { "...": "job object or null" },
  "last_apply_job": { "...": "job object or null" }
}
```

## Templates

### `GET /api/templates`
- Auth required.
- Returns:
```json
{
  "templates_root": "./templates/opentofu/environments",
  "modules_root": "./templates/opentofu/modules",
  "environment_sets": [
    {
      "name": "basic",
      "path": "./templates/opentofu/environments/basic",
      "files": ["README.md", "main.tf", "outputs.tf", "providers.tf", "terraform.tfvars.json.example", "variables.tf", "versions.tf"]
    }
  ],
  "modules": [
    {
      "name": "network",
      "path": "./templates/opentofu/modules/network",
      "files": ["main.tf", "outputs.tf", "variables.tf"]
    }
  ]
}
```

### `GET /api/templates/:kind/:name`
- Auth required.
- `kind` is `environment` or `module`.
- Returns the selected template descriptor plus validation posture:
```json
{
  "descriptor": {
    "name": "basic",
    "path": "./templates/opentofu/environments/basic",
    "files": ["README.md", "main.tf", "outputs.tf", "providers.tf", "terraform.tfvars.json.example", "variables.tf", "versions.tf"]
  },
  "validation": {
    "kind": "environment",
    "name": "basic",
    "path": "./templates/opentofu/environments/basic",
    "required_files": ["main.tf", "variables.tf", "outputs.tf", "versions.tf"],
    "missing_files": [],
    "warnings": [],
    "valid": true,
    "readme_exists": true
  }
}
```

### `POST /api/templates/:kind/:name/validate`
- Auth required.
- Re-runs renderer-facing file validation for the selected environment template or module.
- Returns the `validation` object shown above.

## Audit Feed

### `GET /api/audit`
- Auth required.
- Query params:
  - `limit`
  - `resource_type`
  - `resource_id`
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
  ],
  "resource_type": "environment",
  "resource_id": "",
  "limit": 200
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
- If the source job belongs to a first-class environment (`environment_id` present), this route is rejected. Use `POST /api/environments/:id/plan` so environment state and audit stay consistent.

### `POST /api/jobs/:id/apply`
- Auth required.
- Admin only.
- Source job must be a completed `tofu.plan` job with `workdir` and `plan_path`.
- Creates a new queued `tofu.apply` job derived from that plan job.
- If the source plan belongs to a first-class environment (`environment_id` present), this route is rejected. Use `POST /api/environments/:id/apply`.

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
