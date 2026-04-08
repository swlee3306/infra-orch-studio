# Concurrency Smoke Checklist

This checklist validates the environment revision guard, conflict UX, and smart retry flow.

## Scope

- Environment mutation APIs with `expected_revision`:
  - `POST /api/environments/:id/plan`
  - `POST /api/environments/:id/approve`
  - `POST /api/environments/:id/apply`
  - `POST /api/environments/:id/retry`
  - `POST /api/environments/:id/destroy`
- Web screens:
  - `/environments/:id/review`
  - `/environments/:id/approval`
  - `/environments/:id`

## Preconditions

- One environment exists and is visible in both browser tabs.
- Two authenticated admin sessions are open:
  - Tab A
  - Tab B
- API and runner are healthy.

## Scenario A: Plan conflict (review/detail)

1. Open the same environment in Tab A and Tab B.
2. In Tab A, queue update plan from environment detail.
3. Without refreshing Tab B, queue update plan from Tab B.
4. Confirm Tab B receives conflict handling behavior:
   - API returns `409` (or conflict text).
   - UI auto-refreshes environment state.
   - Conflict callout shows delta (revision/status/last job if changed).
   - Error panel shows retry action.
5. Click `Retry last action` in Tab B.
6. Confirm retry uses latest revision and succeeds or returns a new explicit domain validation error (not stale revision mismatch).

## Scenario B: Approve/apply conflict (review + approval)

1. Move environment to `pending_approval`.
2. Keep review or approval page open in both tabs.
3. In Tab A, approve.
4. In Tab B, approve with stale state.
5. Confirm conflict callout and retry behavior in Tab B.
6. In Tab A, apply.
7. In Tab B, apply from stale screen.
8. Confirm conflict callout and smart retry behavior again.

## Scenario C: Destroy conflict (approval)

1. Open approval control in both tabs.
2. Enter typed confirmation in both tabs.
3. In Tab A, queue destroy plan.
4. In Tab B, queue destroy plan without refresh.
5. Confirm conflict callout + retry button in Tab B.
6. Confirm retry sends latest revision and proceeds only if domain state still allows destroy.

## Expected Results

- No silent stale overwrite of environment state.
- Conflict paths are operator-visible and actionable.
- Retry button replays the same user intent with latest revision.
- Form inputs remain intact after conflict refresh:
  - approval comment
  - destroy comment
  - typed confirmation
  - desired-state editor inputs

## Evidence To Capture

- Screenshots for each conflict callout and retry action.
- API response snippets showing conflict text.
- Audit entries around conflict windows, including runner conflict events when applicable.

