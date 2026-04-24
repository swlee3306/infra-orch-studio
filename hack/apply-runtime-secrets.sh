#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  NAMESPACE=infra \
  MYSQL_PASSWORD=... \
  MYSQL_ROOT_PASSWORD=... \
  ADMIN_EMAIL=admin@example.com \
  ADMIN_PASSWORD=... \
  PROVIDER_SECRET_KEY=... \
  OPENSTACK_CLOUDS_FILE=/path/to/clouds.yaml \
  TLS_CRT_FILE=/path/to/tls.crt \
  TLS_KEY_FILE=/path/to/tls.key \
  hack/apply-runtime-secrets.sh

Required:
  MYSQL_PASSWORD
  MYSQL_ROOT_PASSWORD
  PROVIDER_SECRET_KEY
  OPENSTACK_CLOUDS_FILE

Recommended for first install:
  ADMIN_EMAIL
  ADMIN_PASSWORD

Optional:
  TLS_CRT_FILE and TLS_KEY_FILE create the prod ingress TLS secret infra-orch-tls.

Defaults:
  NAMESPACE=infra
  MYSQL_HOST=infra-orch-mysql
  MYSQL_PORT=3306
  MYSQL_DB=infra_orch
  MYSQL_USER=infra_orch
USAGE
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then
  usage
  exit 0
fi

require_env() {
  local key="$1"
  if [[ -z "${!key:-}" ]]; then
    echo "missing required env: ${key}" >&2
    usage >&2
    exit 2
  fi
}

require_file() {
  local key="$1"
  local path="${!key:-}"
  if [[ -z "$path" || ! -f "$path" ]]; then
    echo "missing readable file env: ${key}" >&2
    usage >&2
    exit 2
  fi
}

require_env MYSQL_PASSWORD
require_env MYSQL_ROOT_PASSWORD
require_env PROVIDER_SECRET_KEY
require_file OPENSTACK_CLOUDS_FILE

NAMESPACE="${NAMESPACE:-infra}"
MYSQL_HOST="${MYSQL_HOST:-infra-orch-mysql}"
MYSQL_PORT="${MYSQL_PORT:-3306}"
MYSQL_DB="${MYSQL_DB:-infra_orch}"
MYSQL_USER="${MYSQL_USER:-infra_orch}"

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

kubectl create namespace "$NAMESPACE" --dry-run=client -o yaml >"$tmpdir/namespace.yaml"
kubectl apply -f "$tmpdir/namespace.yaml"

kubectl -n "$NAMESPACE" create secret generic infra-orch-mysql \
  --from-literal=MYSQL_HOST="$MYSQL_HOST" \
  --from-literal=MYSQL_PORT="$MYSQL_PORT" \
  --from-literal=MYSQL_DB="$MYSQL_DB" \
  --from-literal=MYSQL_USER="$MYSQL_USER" \
  --from-literal=MYSQL_PASSWORD="$MYSQL_PASSWORD" \
  --from-literal=MYSQL_ROOT_PASSWORD="$MYSQL_ROOT_PASSWORD" \
  --dry-run=client -o yaml >"$tmpdir/infra-orch-mysql.yaml"
kubectl apply -f "$tmpdir/infra-orch-mysql.yaml"

admin_args=(
  --from-literal=PROVIDER_SECRET_KEY="$PROVIDER_SECRET_KEY"
)
if [[ -n "${ADMIN_EMAIL:-}" || -n "${ADMIN_PASSWORD:-}" ]]; then
  require_env ADMIN_EMAIL
  require_env ADMIN_PASSWORD
  admin_args+=(
    --from-literal=ADMIN_EMAIL="$ADMIN_EMAIL"
    --from-literal=ADMIN_PASSWORD="$ADMIN_PASSWORD"
  )
fi

kubectl -n "$NAMESPACE" create secret generic infra-orch-admin \
  "${admin_args[@]}" \
  --dry-run=client -o yaml >"$tmpdir/infra-orch-admin.yaml"
kubectl apply -f "$tmpdir/infra-orch-admin.yaml"

kubectl -n "$NAMESPACE" create secret generic openstack-clouds \
  --from-file=clouds.yaml="$OPENSTACK_CLOUDS_FILE" \
  --dry-run=client -o yaml >"$tmpdir/openstack-clouds.yaml"
kubectl apply -f "$tmpdir/openstack-clouds.yaml"

if [[ -n "${TLS_CRT_FILE:-}" || -n "${TLS_KEY_FILE:-}" ]]; then
  require_file TLS_CRT_FILE
  require_file TLS_KEY_FILE
  kubectl -n "$NAMESPACE" create secret tls infra-orch-tls \
    --cert="$TLS_CRT_FILE" \
    --key="$TLS_KEY_FILE" \
    --dry-run=client -o yaml >"$tmpdir/infra-orch-tls.yaml"
  kubectl apply -f "$tmpdir/infra-orch-tls.yaml"
else
  echo "warning: TLS_CRT_FILE/TLS_KEY_FILE not set; prod ingress requires secret infra-orch-tls" >&2
fi

echo "runtime secrets applied in namespace ${NAMESPACE}"
