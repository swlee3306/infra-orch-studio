#!/usr/bin/env bash
set -euo pipefail

API_BASE="${API_BASE:-http://localhost:8080/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"

if [[ -z "$ADMIN_EMAIL" || -z "$ADMIN_PASSWORD" ]]; then
  echo "ADMIN_EMAIL and ADMIN_PASSWORD are required" >&2
  exit 2
fi

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "$bin is required" >&2
    exit 2
  fi
done

api_root="${API_BASE%/api}"
cookie_jar="$(mktemp)"
payload_file="$(mktemp)"
response_file="$(mktemp)"
trap 'rm -f "$cookie_jar" "$payload_file" "$response_file"' EXIT

curl_json() {
  curl -fsS \
    -H "content-type: application/json" \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    "$@"
}

echo "smoke: health"
curl -fsS "$api_root/healthz" >/dev/null

echo "smoke: login"
curl_json \
  -X POST "$API_BASE/auth/login" \
  --data "$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email:$email,password:$password}')" \
  >/dev/null

cat >"$payload_file" <<'JSON'
{
  "spec": {
    "environment_name": "smoke-env",
    "tenant_name": "smoke-tenant",
    "network": {"name": "smoke-net", "cidr": "10.88.0.0/24"},
    "subnet": {"name": "smoke-subnet", "cidr": "10.88.0.0/24", "enable_dhcp": true},
    "instances": [{"name": "smoke-vm", "image": "ubuntu", "flavor": "small", "count": 1}]
  },
  "template_name": "basic"
}
JSON

echo "smoke: create environment and initial plan job"
curl_json -X POST "$API_BASE/environments" --data @"$payload_file" >"$response_file"
environment_id="$(jq -r '.environment.id // empty' "$response_file")"
job_id="$(jq -r '.job.id // empty' "$response_file")"
if [[ -z "$environment_id" || -z "$job_id" ]]; then
  echo "create response missing environment/job id" >&2
  cat "$response_file" >&2
  exit 1
fi

echo "smoke: get environment $environment_id"
curl_json "$API_BASE/environments/$environment_id" | jq -e --arg id "$environment_id" '.id == $id' >/dev/null

echo "smoke: get job $job_id"
curl_json "$API_BASE/jobs/$job_id" | jq -e --arg id "$job_id" '.id == $id and .status != ""' >/dev/null

echo "smoke: list environment jobs"
curl_json "$API_BASE/environments/$environment_id/jobs" | jq -e --arg id "$job_id" '.items | any(.id == $id)' >/dev/null

echo "smoke: read job logs endpoint"
curl_json "$API_BASE/jobs/$job_id/logs" | jq -e --arg id "$job_id" '.job_id == $id and (.items | type == "array")' >/dev/null

echo "smoke: ok environment_id=$environment_id job_id=$job_id"
