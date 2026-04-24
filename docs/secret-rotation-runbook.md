# Secret Rotation Runbook

Use this runbook when credentials have changed or when a secret value may have been exposed.

## Required Rotation

Rotate these outside the repository:

- OpenStack password or application credential in `clouds.yaml`
- MySQL application password
- MySQL root password
- Admin seed password, if still used
- `PROVIDER_SECRET_KEY`, only during a planned provider credential re-encryption window
- TLS certificate and private key before expiry or after key exposure

If any real credential was committed to Git, rotate it at the source system. Removing it from the current file is not enough because it can remain in Git history, clones, CI logs, or backups.

## Apply Runtime Secrets

Prepare real values locally and run:

```bash
NAMESPACE=infra \
MYSQL_PASSWORD='replace-with-real-value' \
MYSQL_ROOT_PASSWORD='replace-with-real-value' \
ADMIN_EMAIL='admin@example.com' \
ADMIN_PASSWORD='replace-with-real-value' \
PROVIDER_SECRET_KEY='replace-with-long-random-secret' \
OPENSTACK_CLOUDS_FILE="$HOME/.config/openstack/clouds.yaml" \
TLS_CRT_FILE="/path/to/tls.crt" \
TLS_KEY_FILE="/path/to/tls.key" \
hack/apply-runtime-secrets.sh
```

For a cluster that already has an admin user, omit `ADMIN_EMAIL` and `ADMIN_PASSWORD` to avoid reseeding the password.

## Roll Workloads

After applying secrets, restart the workloads that consume them:

```bash
kubectl -n infra rollout restart deploy/infra-orch-api
kubectl -n infra rollout restart deploy/infra-orch-runner
kubectl -n infra rollout restart statefulset/infra-orch-mysql
kubectl -n infra rollout status deploy/infra-orch-api
kubectl -n infra rollout status deploy/infra-orch-runner
kubectl -n infra rollout status statefulset/infra-orch-mysql
```

## Provider Password Encryption Notes

When `PROVIDER_SECRET_KEY` is set, newly created or updated provider connection passwords are encrypted before they are stored in MySQL.

Existing plaintext provider passwords remain readable for compatibility. To migrate them, open each provider connection in the UI and save it again after `PROVIDER_SECRET_KEY` is present.

Do not rotate `PROVIDER_SECRET_KEY` without first re-saving or exporting provider credentials. Existing encrypted rows require the old key to decrypt.

## Verification

```bash
kubectl -n infra get secret infra-orch-mysql infra-orch-admin openstack-clouds infra-orch-tls
kubectl -n infra rollout status deploy/infra-orch-api
kubectl -n infra rollout status deploy/infra-orch-runner
kubectl -n infra exec deploy/infra-orch-runner -- test -f /etc/openstack/clouds.yaml
kubectl -n infra exec deploy/infra-orch-api -- wget -qO- http://127.0.0.1:8080/healthz
```

Then run a small create -> plan -> approve -> apply smoke test against a low-risk OpenStack target.
