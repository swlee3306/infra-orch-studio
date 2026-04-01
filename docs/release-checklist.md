# Release Checklist

## Pre-merge

- [ ] All new or changed contract tests pass.
- [ ] `make fmt-check` passes.
- [ ] `make test-contract` passes.
- [ ] `make vet-contract` passes.
- [ ] Any new docs match the implemented behavior.
- [ ] No file outside the approved scope was modified.

## Pre-release

- [ ] Confirm the backend and runner images are built from the expected commit.
- [ ] Confirm the UI is built from the expected commit.
- [ ] Confirm environment variables for MySQL, OpenStack, and API address are documented.
- [ ] Confirm the release target matches the intended environment: dev, stage, or prod.
- [ ] Confirm the current repository-wide MySQL syntax issue has been cleared before relying on full `go test ./...`.

## Functional Smoke Checks

- [ ] Sign up or log in with a test user.
- [ ] Open `GET /api/auth/me` and confirm the session cookie works.
- [ ] Create an environment job.
- [ ] List jobs and confirm the new job appears.
- [ ] Open a job detail page and confirm status renders.
- [ ] Create a plan job, then trigger apply only from a done plan job and only as admin.

## Operational Checks

- [ ] Confirm `/healthz` returns `200`.
- [ ] Confirm the runner can claim queued jobs.
- [ ] Confirm logs appear in the workdir `.infra-orch/logs` path.
- [ ] Confirm secrets and config are mounted where the pod expects them.
- [ ] Confirm rollback instructions are available before any production cutover.

## Rollback

- [ ] Keep the previous image tag available.
- [ ] Keep the previous kustomize or manifest revision available.
- [ ] Confirm a rollback does not delete persisted job metadata or state.
- [ ] Re-run smoke checks after rollback.

