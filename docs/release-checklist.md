# Release Checklist

## Pre-merge

- [ ] `go test ./...` passes.
- [ ] `npm --prefix web run build` passes when web code changed.
- [ ] Any new docs match the implemented behavior.
- [ ] No file outside the approved scope was modified.

## Pre-release

- [ ] Confirm the backend and runner images are built from the expected commit.
- [ ] Confirm the UI is built from the expected commit.
- [ ] Confirm environment variables for MySQL, OpenStack, and API address are documented.
- [ ] Confirm the release target matches the intended environment: dev, stage, or prod.
- [ ] Confirm runtime secrets were applied with `hack/apply-runtime-secrets.sh` or an external secret manager.
- [ ] Confirm `PROVIDER_SECRET_KEY` is present before provider connections are created or updated.
- [ ] Confirm prod TLS secret `infra-orch-tls` exists before applying the prod overlay.
- [ ] Confirm MySQL migration logs are clean on the target cluster.
- [ ] Confirm API and runner startup logs show template asset validation succeeded.

## Functional Smoke Checks

- [ ] Sign up or log in with a test user.
- [ ] Open `GET /api/auth/me` and confirm the session cookie works.
- [ ] Create an environment from the create wizard.
- [ ] Open plan review and confirm review signals, impact summary, and approval comment flow work.
- [ ] Approve as admin, then apply from approval control.
- [ ] Open environment detail and confirm artifacts, audit, and recent jobs are linked.
- [ ] Run `docs/concurrency-smoke-checklist.md` with two tabs and confirm conflict auto-refresh + smart retry behavior.
- [ ] If using OpenClaw automation, run the prompt template in `docs/openclaw-concurrency-prompt.md` and archive artifacts.
- [ ] Summarize OpenClaw artifacts with `hack/summarize-openclaw-report.sh <artifact-dir> --out <artifact-dir>/SUMMARY.md`.
- [ ] Extract route-level UI TODOs with `hack/extract-openclaw-ui-todos.sh <artifact-dir> --out <artifact-dir>/UI-TODO.md`.
- [ ] Record the final artifact path, tested commit SHA, and blocker status in `docs/ui-revalidation-log.md`.

## Operational Checks

- [ ] Confirm `/healthz` returns `200`.
- [ ] Confirm the runner can claim queued jobs.
- [ ] Confirm logs appear in the workdir `.infra-orch/logs` path.
- [ ] Confirm secrets and config are mounted where the pod expects them.
- [ ] Confirm `openstack-clouds` was created from a rotated `clouds.yaml`, not from a committed example.
- [ ] Confirm `/app/templates/opentofu/environments/basic` contains `main.tf`, `variables.tf`, `outputs.tf`, and `versions.tf`.
- [ ] Confirm ingress/controller behavior matches the environment model, or that Argo CD ingress health is intentionally ignored in bare-metal/DDNS setups.
- [ ] Confirm rollback instructions are available before any production cutover.

## Rollback

- [ ] Keep the previous image tag available.
- [ ] Keep the previous kustomize or manifest revision available.
- [ ] Confirm a rollback does not delete persisted job metadata or state.
- [ ] Re-run smoke checks after rollback.
