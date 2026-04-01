# Operations Guide

## Deployment Modes

### Local path

Use `deployments/k8s/` when you want a manual, minimal deployment with a single namespace.

### Environment overlays

Use `k8s/app/overlays/dev`, `k8s/app/overlays/stage`, and `k8s/app/overlays/prod` for more production-like rollout management.

## Recommended Order

1. Apply namespace and secrets/config.
2. Apply MySQL.
3. Apply app workloads.
4. Verify API health.
5. Verify web access and WebSocket connectivity.
6. Run a small create -> plan -> apply flow.

## Operational Checks

Before opening the system to users:

- Confirm MySQL is running and the app can connect with the expected secret keys.
- Confirm the runner pod has persistent workdir storage mounted.
- Confirm the OpenStack secret is mounted at `/etc/openstack/clouds.yaml`.
- Confirm the API readiness probe is passing.
- Confirm the web service can reach `/api` and `/ws` through Nginx.

## Rollout Checklist

- Verify the image tag being promoted in the overlay.
- Verify `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DB`, `MYSQL_USER`, and `MYSQL_PASSWORD` are present.
- Verify admin seed credentials are set intentionally, or omitted for an existing admin account.
- Verify the OpenStack config secret matches the intended cloud name.
- Verify the PVC for workdirs is bound before running jobs.

## Incident Response

If plan/apply jobs fail:

- Check the job record in the API.
- Check runner pod logs.
- Check the mounted workdir for generated plan artifacts.
- Check that the OpenStack config secret still matches the configured cloud name.
- If the issue is storage-related, inspect PVC binding and MySQL pod health before retrying.

## Rollback Guidance

- Roll back by reverting the overlay image tag and reapplying the same environment overlay.
- Do not manually mutate job history unless you are recovering from a clear storage outage.
- If a runner crash happened mid-job, inspect the workdir before triggering a replacement job.

## Backup Guidance

- Back up MySQL before any environment-wide upgrade.
- Snapshot or back up the runner PVC if you need to preserve job artifacts.
- Keep the OpenStack secret out of git and rotate it independently of the application release.

## Verification Commands

```bash
kubectl -n infra get pods
kubectl -n infra get pvc
kubectl -n infra logs deploy/infra-orch-api
kubectl -n infra logs deploy/infra-orch-runner
kubectl -n infra port-forward svc/infra-orch-api 8080:8080
kubectl -n infra port-forward svc/infra-orch-web 8081:80
```
