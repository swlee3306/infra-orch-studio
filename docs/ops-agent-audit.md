# Ops Agent Audit

## Current State

`infra-orch-studio` is no longer a pure MVP skeleton. It now has:

- a split API/runner runtime,
- a shared-image Kubernetes deployment model,
- persistent runner workdir storage,
- MySQL-backed metadata and auth storage,
- kustomize overlays for dev, stage, and prod,
- ingress-based web exposure,
- and documentation that describes the local and Kubernetes deployment paths.

The operational shape is good enough for a small private platform, but it is not yet a fully safe SaaS deployment. The main gaps are around ingress exposure semantics, state durability, config/secret separation, rollout predictability, and incident recovery.

## Findings

### 1. Deployment topology is split, but not fully normalized

- `k8s/app/` is the stronger path and should be treated as the primary production model.
- `deployments/k8s/` still exists as a manual or legacy path and duplicates the same runtime in a less controlled form.
- The repository currently exposes both paths, which makes it too easy for operators to deploy the wrong one.

### 2. State is partially durable, but recovery semantics are still weak

- Runner workdirs now use a PVC, which is the right direction.
- MySQL stores job metadata and auth state, but it is still the only authoritative store for lifecycle history.
- Plan files, logs, and rendered artifacts live under the workdir, but there is no explicit state backend abstraction for long-term retention, pruning, or cross-node recovery.

### 3. Config and secrets are improved, but still not deployment-grade

- Shared runtime values are in a ConfigMap.
- MySQL, admin seed, and OpenStack credentials are represented as separate secret objects.
- The examples are still operator-managed placeholders, so the manifests are structurally correct but operationally incomplete until real values are injected.

### 4. Ingress is functional, but host-based access still needs operator discipline

- The web app is exposed through ingress-nginx rather than direct NodePort.
- That is better for prod, but it requires host-based routing to be configured correctly.
- External access through bastion, DDNS, or another front door must preserve the Host header or the request will fall through to the wrong backend and return 503.

### 5. Rollout strategy is still image-tag driven, not policy driven

- CI updates prod overlay image tags automatically.
- This is workable, but it couples build output to deployment promotion.
- There is no explicit policy layer for canary, staged rollout, or automatic rollback on bad health.

### 6. Incident recovery is manual

- The current docs explain how to check pods, PVCs, logs, and workdirs.
- There is still no operator runbook for failed apply jobs, MySQL recovery, or workdir preservation during pod replacement beyond manual inspection.

## Recommendations

### State backend strategy

- Keep MySQL as the metadata and auth backend.
- Keep runner workdirs on PVC for short-lived plan/apply artifacts.
- Introduce a clear retention policy for artifacts and logs.
- If the platform grows, add an explicit artifact backend later instead of overloading MySQL with blobs.

### Config and secret separation

- Keep non-secret runtime values in ConfigMaps.
- Keep admin seed, MySQL credentials, and OpenStack credentials in separate Secrets.
- Remove placeholder example values from any production overlay path.
- Treat the OpenStack secret as a required operator input, not a default.

### Ingress and exposure

- Prefer ingress-based web access for production and stage.
- Make sure the external front door preserves Host headers.
- Avoid relying on direct IP access as the primary model.
- If bastion forwarding is used, forward to the node that actually hosts the ingress controller or make the ingress service cluster-wide.

### Rollout and rollback

- Keep image promotion tag-based, but pair it with health-based verification.
- Require readiness and liveness probes for API, runner, web, and MySQL.
- Add a simple rollback rule: revert overlay image tags and re-sync if health checks fail.
- If a runner dies mid-job, preserve workdir PVC contents long enough to inspect the failed artifact.

### Incident response

- Document the first five checks for failed apply or plan jobs: MySQL, runner pod, workdir PVC, OpenStack secret, and job record.
- Add a clear operator decision point for retry versus manual cleanup.
- Preserve logs and plan artifacts long enough for root-cause analysis.

## Operational Risk Summary

- High: wrong ingress host or wrong front door makes the app appear broken even when pods are healthy.
- High: artifact and workdir retention are not policy-driven yet.
- Medium: `deployments/k8s/` and `k8s/app/` can diverge and confuse operators.
- Medium: rollout is automatic at tag level but not yet controlled by explicit environment promotion rules.
- Medium: secrets are structurally separated, but still placeholder-driven in examples.

## Files Reviewed

- `README.md`
- `docs/operations-guide.md`
- `docs/configuration-reference.md`
- `k8s/app/base/*`
- `k8s/app/overlays/dev/*`
- `k8s/app/overlays/stage/*`
- `k8s/app/overlays/prod/*`
- `k8s/mysql/base/*`
- `deployments/k8s/*`
- `web/nginx.conf`

