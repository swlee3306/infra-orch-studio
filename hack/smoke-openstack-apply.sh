#!/usr/bin/env bash
set -euo pipefail

SMOKE_ENV_FILE="${SMOKE_ENV_FILE:-}"
if [[ -n "$SMOKE_ENV_FILE" ]]; then
  if [[ ! -f "$SMOKE_ENV_FILE" ]]; then
    echo "SMOKE_ENV_FILE does not exist: $SMOKE_ENV_FILE" >&2
    exit 2
  fi
  set -a
  # shellcheck disable=SC1090
  source "$SMOKE_ENV_FILE"
  set +a
fi

trim_value() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}

bool_true() {
  case "$1" in
    true|TRUE|1|yes|YES)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

API_BASE="${API_BASE:-http://localhost:8080/api}"
ADMIN_EMAIL="${ADMIN_EMAIL:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-}"
OPENSTACK_CLOUD="${OPENSTACK_CLOUD:-demo}"
OPENSTACK_AUTH_URL="${OPENSTACK_AUTH_URL:-}"
OPENSTACK_USERNAME="${OPENSTACK_USERNAME:-}"
OPENSTACK_PASSWORD="${OPENSTACK_PASSWORD:-}"
OPENSTACK_PROJECT_NAME="${OPENSTACK_PROJECT_NAME:-}"
OPENSTACK_PROJECT_ID="${OPENSTACK_PROJECT_ID:-}"
OPENSTACK_REGION_NAME="${OPENSTACK_REGION_NAME:-}"
OPENSTACK_INTERFACE="${OPENSTACK_INTERFACE:-public}"
OPENSTACK_IDENTITY_INTERFACE="${OPENSTACK_IDENTITY_INTERFACE:-$OPENSTACK_INTERFACE}"
OPENSTACK_USER_DOMAIN_NAME="${OPENSTACK_USER_DOMAIN_NAME:-Default}"
OPENSTACK_PROJECT_DOMAIN_NAME="${OPENSTACK_PROJECT_DOMAIN_NAME:-Default}"
OPENSTACK_ENDPOINT_OVERRIDE_JSON="${OPENSTACK_ENDPOINT_OVERRIDE_JSON:-}"
if [[ -z "$OPENSTACK_ENDPOINT_OVERRIDE_JSON" ]]; then
  OPENSTACK_ENDPOINT_OVERRIDE_JSON="{}"
fi
SMOKE_PREFLIGHT_ONLY="${SMOKE_PREFLIGHT_ONLY:-false}"
SMOKE_NAME_SUFFIX="${SMOKE_NAME_SUFFIX:-$(date +%Y%m%d%H%M%S)}"
SMOKE_ENV_NAME="${SMOKE_ENV_NAME:-smoke-openstack-apply-$SMOKE_NAME_SUFFIX}"
SMOKE_TENANT_NAME="${SMOKE_TENANT_NAME:-smoke-tenant-$SMOKE_NAME_SUFFIX}"
SMOKE_NETWORK_NAME="${SMOKE_NETWORK_NAME:-smoke-net-$SMOKE_NAME_SUFFIX}"
SMOKE_CIDR_OCTET="${SMOKE_CIDR_OCTET:-}"
if [[ -z "$SMOKE_CIDR_OCTET" ]]; then
  if [[ "${SMOKE_NAME_SUFFIX: -2}" =~ ^[0-9]{2}$ ]]; then
    SMOKE_CIDR_OCTET="$((10#${SMOKE_NAME_SUFFIX: -2} + 10))"
  elif bool_true "$SMOKE_PREFLIGHT_ONLY"; then
    SMOKE_CIDR_OCTET="10"
  else
    echo "SMOKE_NAME_SUFFIX must end with two digits when SMOKE_CIDR_OCTET is not set" >&2
    exit 2
  fi
fi
SMOKE_NETWORK_CIDR="${SMOKE_NETWORK_CIDR:-10.${SMOKE_CIDR_OCTET}.0.0/24}"
SMOKE_SUBNET_NAME="${SMOKE_SUBNET_NAME:-smoke-subnet-$SMOKE_NAME_SUFFIX}"
SMOKE_IMAGE="${SMOKE_IMAGE:-}"
SMOKE_FLAVOR="${SMOKE_FLAVOR:-}"
SMOKE_SECURITY_GROUPS="${SMOKE_SECURITY_GROUPS:-auto}"
SMOKE_SSH_KEY_NAME="${SMOKE_SSH_KEY_NAME:-}"
SMOKE_INSTANCE_NAME="${SMOKE_INSTANCE_NAME:-smoke-vm-$SMOKE_NAME_SUFFIX}"
SMOKE_INSTANCE_COUNT="${SMOKE_INSTANCE_COUNT:-1}"
SMOKE_TIMEOUT_SECONDS="${SMOKE_TIMEOUT_SECONDS:-600}"
SMOKE_POLL_SECONDS="${SMOKE_POLL_SECONDS:-5}"
SMOKE_QUEUED_TIMEOUT_SECONDS="${SMOKE_QUEUED_TIMEOUT_SECONDS:-60}"
SMOKE_DESTROY_AFTER_APPLY="${SMOKE_DESTROY_AFTER_APPLY:-true}"
SMOKE_DESTROY_ON_APPLY_FAILURE="${SMOKE_DESTROY_ON_APPLY_FAILURE:-true}"
SMOKE_SKIP_PROVIDER_UPSERT="${SMOKE_SKIP_PROVIDER_UPSERT:-false}"
SMOKE_VERIFY_WS="${SMOKE_VERIFY_WS:-auto}"
SMOKE_WS_TIMEOUT_SECONDS="${SMOKE_WS_TIMEOUT_SECONDS:-15}"
SMOKE_DRY_RUN_CONFIG="${SMOKE_DRY_RUN_CONFIG:-false}"

API_BASE="$(trim_value "$API_BASE")"
ADMIN_EMAIL="$(trim_value "$ADMIN_EMAIL")"
OPENSTACK_CLOUD="$(trim_value "$OPENSTACK_CLOUD")"
OPENSTACK_AUTH_URL="$(trim_value "$OPENSTACK_AUTH_URL")"
OPENSTACK_USERNAME="$(trim_value "$OPENSTACK_USERNAME")"
OPENSTACK_PROJECT_NAME="$(trim_value "$OPENSTACK_PROJECT_NAME")"
OPENSTACK_PROJECT_ID="$(trim_value "$OPENSTACK_PROJECT_ID")"
OPENSTACK_REGION_NAME="$(trim_value "$OPENSTACK_REGION_NAME")"
OPENSTACK_INTERFACE="$(trim_value "$OPENSTACK_INTERFACE")"
OPENSTACK_IDENTITY_INTERFACE="$(trim_value "$OPENSTACK_IDENTITY_INTERFACE")"
OPENSTACK_USER_DOMAIN_NAME="$(trim_value "$OPENSTACK_USER_DOMAIN_NAME")"
OPENSTACK_PROJECT_DOMAIN_NAME="$(trim_value "$OPENSTACK_PROJECT_DOMAIN_NAME")"
SMOKE_ENV_NAME="$(trim_value "$SMOKE_ENV_NAME")"
SMOKE_TENANT_NAME="$(trim_value "$SMOKE_TENANT_NAME")"
SMOKE_NETWORK_NAME="$(trim_value "$SMOKE_NETWORK_NAME")"
SMOKE_SUBNET_NAME="$(trim_value "$SMOKE_SUBNET_NAME")"
SMOKE_INSTANCE_NAME="$(trim_value "$SMOKE_INSTANCE_NAME")"

required=(
  ADMIN_EMAIL
  ADMIN_PASSWORD
)

for name in "${required[@]}"; do
  if [[ -z "${!name}" ]]; then
    echo "$name is required" >&2
    exit 2
  fi
done

case "$SMOKE_SKIP_PROVIDER_UPSERT" in
  true|TRUE|1|yes|YES)
    ;;
  *)
    provider_required=(
      OPENSTACK_AUTH_URL
      OPENSTACK_USERNAME
      OPENSTACK_PASSWORD
    )
    for name in "${provider_required[@]}"; do
      if [[ -z "${!name}" ]]; then
        echo "$name is required unless SMOKE_SKIP_PROVIDER_UPSERT=true" >&2
        exit 2
      fi
    done
    if [[ -z "$OPENSTACK_PROJECT_NAME" && -z "$OPENSTACK_PROJECT_ID" ]]; then
      echo "OPENSTACK_PROJECT_NAME or OPENSTACK_PROJECT_ID is required unless SMOKE_SKIP_PROVIDER_UPSERT=true" >&2
      exit 2
    fi
    ;;
esac

for bin in curl jq; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    echo "$bin is required" >&2
    exit 2
  fi
done

if ! jq -n -e --arg url "$API_BASE" '$url | test("^https?://[^/]+/api/?$")' >/dev/null; then
  echo "API_BASE must be an http or https URL ending with /api" >&2
  exit 2
fi
API_BASE="${API_BASE%/}"
nonempty_names=(OPENSTACK_CLOUD)
if ! bool_true "$SMOKE_PREFLIGHT_ONLY"; then
  nonempty_names+=(SMOKE_ENV_NAME SMOKE_TENANT_NAME SMOKE_NETWORK_NAME SMOKE_SUBNET_NAME SMOKE_INSTANCE_NAME)
fi
for nonempty_name in "${nonempty_names[@]}"; do
  if [[ -z "${!nonempty_name//[[:space:]]/}" ]]; then
    echo "$nonempty_name must not be empty" >&2
    exit 2
  fi
done
if ! [[ "$OPENSTACK_CLOUD" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "OPENSTACK_CLOUD must contain only letters, numbers, dots, underscores, or dashes" >&2
  exit 2
fi
SMOKE_IMAGE="$(jq -nr --arg value "$SMOKE_IMAGE" '$value | gsub("^\\s+|\\s+$"; "")')"
SMOKE_FLAVOR="$(jq -nr --arg value "$SMOKE_FLAVOR" '$value | gsub("^\\s+|\\s+$"; "")')"
for interface_name in OPENSTACK_INTERFACE OPENSTACK_IDENTITY_INTERFACE; do
  case "${!interface_name}" in
    public|internal|admin)
      ;;
    *)
      echo "$interface_name must be public, internal, or admin" >&2
      exit 2
      ;;
  esac
done
if ! jq -e 'type == "object" and all(.[]; type == "string")' >/dev/null <<<"$OPENSTACK_ENDPOINT_OVERRIDE_JSON"; then
  echo "OPENSTACK_ENDPOINT_OVERRIDE_JSON must be a JSON object with string values" >&2
  exit 2
fi
case "$SMOKE_SKIP_PROVIDER_UPSERT" in
  true|TRUE|1|yes|YES)
    ;;
  *)
    if ! jq -n -e --arg url "$OPENSTACK_AUTH_URL" '$url | test("^https?://[^/]+")' >/dev/null; then
      echo "OPENSTACK_AUTH_URL must be an http or https URL" >&2
      exit 2
    fi
    if ! jq -e 'all(.[]; test("^https?://[^/]+"))' >/dev/null <<<"$OPENSTACK_ENDPOINT_OVERRIDE_JSON"; then
      echo "OPENSTACK_ENDPOINT_OVERRIDE_JSON values must be http or https URLs" >&2
      exit 2
    fi
    ;;
esac
if ! bool_true "$SMOKE_PREFLIGHT_ONLY"; then
  if ! jq -n -e --arg cidr "$SMOKE_NETWORK_CIDR" '
    ($cidr | capture("^(?<a>[0-9]+)\\.(?<b>[0-9]+)\\.(?<c>[0-9]+)\\.(?<d>[0-9]+)/(?<bits>[0-9]+)$")) as $m
    | ([$m.a, $m.b, $m.c, $m.d, $m.bits] | map(tonumber)) as $n
    | ($n[0] <= 255 and $n[1] <= 255 and $n[2] <= 255 and $n[3] <= 255 and $n[4] >= 0 and $n[4] <= 32)
  ' >/dev/null; then
    echo "SMOKE_NETWORK_CIDR must be a valid IPv4 CIDR" >&2
    exit 2
  fi
  if ! [[ "$SMOKE_CIDR_OCTET" =~ ^[0-9]+$ ]] || (( SMOKE_CIDR_OCTET > 255 )); then
    echo "SMOKE_CIDR_OCTET must be an integer between 0 and 255" >&2
    exit 2
  fi
  if ! [[ "$SMOKE_INSTANCE_COUNT" =~ ^[0-9]+$ ]] || (( SMOKE_INSTANCE_COUNT < 1 || SMOKE_INSTANCE_COUNT > 2 )); then
    echo "SMOKE_INSTANCE_COUNT must be an integer between 1 and 2" >&2
    exit 2
  fi
fi
for numeric_name in SMOKE_TIMEOUT_SECONDS SMOKE_POLL_SECONDS SMOKE_QUEUED_TIMEOUT_SECONDS SMOKE_WS_TIMEOUT_SECONDS; do
  if ! [[ "${!numeric_name}" =~ ^[0-9]+$ ]]; then
    echo "$numeric_name must be a non-negative integer" >&2
    exit 2
  fi
done
if (( SMOKE_TIMEOUT_SECONDS < 1 || SMOKE_POLL_SECONDS < 1 || SMOKE_WS_TIMEOUT_SECONDS < 1 )); then
  echo "SMOKE_TIMEOUT_SECONDS, SMOKE_POLL_SECONDS, and SMOKE_WS_TIMEOUT_SECONDS must be at least 1" >&2
  exit 2
fi
if (( SMOKE_POLL_SECONDS > SMOKE_TIMEOUT_SECONDS )); then
  echo "SMOKE_POLL_SECONDS must be less than or equal to SMOKE_TIMEOUT_SECONDS" >&2
  exit 2
fi
if (( SMOKE_QUEUED_TIMEOUT_SECONDS > 0 && SMOKE_QUEUED_TIMEOUT_SECONDS > SMOKE_TIMEOUT_SECONDS )); then
  echo "SMOKE_QUEUED_TIMEOUT_SECONDS must be 0 or less than or equal to SMOKE_TIMEOUT_SECONDS" >&2
  exit 2
fi
case "$SMOKE_VERIFY_WS" in
  auto|AUTO|true|TRUE|1|yes|YES|false|FALSE|0|no|NO|"")
    ;;
  *)
    echo "SMOKE_VERIFY_WS must be auto, true, or false" >&2
    exit 2
    ;;
esac
for boolean_name in SMOKE_DESTROY_AFTER_APPLY SMOKE_DESTROY_ON_APPLY_FAILURE; do
  case "${!boolean_name}" in
    true|TRUE|1|yes|YES|false|FALSE|0|no|NO|"")
      ;;
    *)
      echo "$boolean_name must be true or false" >&2
      exit 2
      ;;
  esac
done
case "$SMOKE_DRY_RUN_CONFIG" in
  true|TRUE|1|yes|YES|false|FALSE|0|no|NO|"")
    ;;
  *)
    echo "SMOKE_DRY_RUN_CONFIG must be true or false" >&2
    exit 2
    ;;
esac
case "$SMOKE_PREFLIGHT_ONLY" in
  true|TRUE|1|yes|YES|false|FALSE|0|no|NO|"")
    ;;
  *)
    echo "SMOKE_PREFLIGHT_ONLY must be true or false" >&2
    exit 2
    ;;
esac
trimmed_smoke_security_groups="$(jq -nr --arg value "$SMOKE_SECURITY_GROUPS" '$value | gsub("^\\s+|\\s+$"; "")')"
case "$trimmed_smoke_security_groups" in
  ""|none|NONE|auto|AUTO)
    SMOKE_SECURITY_GROUPS="$trimmed_smoke_security_groups"
    ;;
  *)
    if ! jq -n -e --arg raw "$trimmed_smoke_security_groups" '
      def trim: gsub("^\\s+|\\s+$"; "");
      ($raw | split(",")) as $parts
      | ($parts | length > 0)
      and all($parts[]; (trim | length) > 0)
    ' >/dev/null; then
      echo "SMOKE_SECURITY_GROUPS must be auto, none, or a comma-separated list without empty entries" >&2
      exit 2
    fi
    SMOKE_SECURITY_GROUPS="$trimmed_smoke_security_groups"
    ;;
esac
trimmed_smoke_ssh_key_name="$(jq -nr --arg value "$SMOKE_SSH_KEY_NAME" '$value | gsub("^\\s+|\\s+$"; "")')"
case "$trimmed_smoke_ssh_key_name" in
  ""|none|NONE|auto|AUTO)
    SMOKE_SSH_KEY_NAME="$trimmed_smoke_ssh_key_name"
    ;;
  *)
    SMOKE_SSH_KEY_NAME="$trimmed_smoke_ssh_key_name"
    ;;
esac

case "$SMOKE_DRY_RUN_CONFIG" in
  true|TRUE|1|yes|YES)
    jq -n \
      --arg api_base "$API_BASE" \
      --arg env_file "$SMOKE_ENV_FILE" \
      --arg openstack_cloud "$OPENSTACK_CLOUD" \
      --arg skip_provider_upsert "$SMOKE_SKIP_PROVIDER_UPSERT" \
      --arg provider_input_mode "$(case "$SMOKE_SKIP_PROVIDER_UPSERT" in true|TRUE|1|yes|YES) echo existing-provider ;; *) echo upsert ;; esac)" \
      --arg smoke_env_name "$SMOKE_ENV_NAME" \
      --arg smoke_network_name "$SMOKE_NETWORK_NAME" \
      --arg smoke_network_cidr "$SMOKE_NETWORK_CIDR" \
      --arg verify_ws "$SMOKE_VERIFY_WS" \
      --arg destroy_after_apply "$SMOKE_DESTROY_AFTER_APPLY" \
      --arg destroy_on_apply_failure "$SMOKE_DESTROY_ON_APPLY_FAILURE" \
      --arg preflight_only "$SMOKE_PREFLIGHT_ONLY" \
      --arg image_mode "$(if [[ -n "$SMOKE_IMAGE" ]]; then echo provided; else echo auto; fi)" \
      --arg flavor_mode "$(if [[ -n "$SMOKE_FLAVOR" ]]; then echo provided; else echo auto; fi)" \
      --arg security_groups "$SMOKE_SECURITY_GROUPS" \
      --arg ssh_key_mode "$(if [[ -z "$SMOKE_SSH_KEY_NAME" || "$SMOKE_SSH_KEY_NAME" == "none" || "$SMOKE_SSH_KEY_NAME" == "NONE" ]]; then echo none; elif [[ "$SMOKE_SSH_KEY_NAME" == "auto" || "$SMOKE_SSH_KEY_NAME" == "AUTO" ]]; then echo auto; else echo provided; fi)" \
      --arg instance_count "$SMOKE_INSTANCE_COUNT" \
      --arg timeout_seconds "$SMOKE_TIMEOUT_SECONDS" \
      --arg queued_timeout_seconds "$SMOKE_QUEUED_TIMEOUT_SECONDS" \
      '{
        api_base: $api_base,
        env_file: (if $env_file == "" then null else $env_file end),
        openstack_cloud: $openstack_cloud,
        skip_provider_upsert: $skip_provider_upsert,
        provider_input_mode: $provider_input_mode,
        smoke_env_name: $smoke_env_name,
        smoke_network_name: $smoke_network_name,
        smoke_network_cidr: $smoke_network_cidr,
        verify_ws: $verify_ws,
        destroy_after_apply: $destroy_after_apply,
        destroy_on_apply_failure: $destroy_on_apply_failure,
        preflight_only: $preflight_only,
        image_mode: $image_mode,
        flavor_mode: $flavor_mode,
        security_groups: $security_groups,
        ssh_key_mode: $ssh_key_mode,
        instance_count: ($instance_count | tonumber),
        timeout_seconds: ($timeout_seconds | tonumber),
        queued_timeout_seconds: ($queued_timeout_seconds | tonumber)
      }'
    exit 0
    ;;
esac

reject_placeholder() {
  local name="$1"
  local value="$2"
  shift 2

  for placeholder in "$@"; do
    if [[ "$value" == "$placeholder" ]]; then
      echo "$name still uses placeholder value '$placeholder'; fill a real value or run with SMOKE_DRY_RUN_CONFIG=true" >&2
      exit 2
    fi
  done
}

if [[ "$SMOKE_ENV_FILE" == *.env.example ]]; then
  echo "SMOKE_ENV_FILE points to an example file; copy it to a private env file with real values or run with SMOKE_DRY_RUN_CONFIG=true" >&2
  exit 2
fi

case "$SMOKE_SKIP_PROVIDER_UPSERT" in
  true|TRUE|1|yes|YES)
    ;;
  *)
    reject_placeholder OPENSTACK_AUTH_URL "$OPENSTACK_AUTH_URL" https://openstack.example:5000/v3
    reject_placeholder OPENSTACK_USERNAME "$OPENSTACK_USERNAME" demo-user
    reject_placeholder OPENSTACK_PASSWORD "$OPENSTACK_PASSWORD" change-me
    reject_placeholder OPENSTACK_PROJECT_NAME "$OPENSTACK_PROJECT_NAME" demo-project
    ;;
esac

api_root="${API_BASE%/api}"
cookie_jar="$(mktemp)"
response_file="$(mktemp)"
environment_id=""
plan_job_id=""
apply_job_id=""
destroy_plan_job_id=""
destroy_apply_job_id=""

cleanup() {
  local exit_code=$?
  if (( exit_code != 0 )); then
    echo "smoke: failed exit_code=$exit_code environment_id=${environment_id:-} plan_job_id=${plan_job_id:-} apply_job_id=${apply_job_id:-} destroy_plan_job_id=${destroy_plan_job_id:-} destroy_apply_job_id=${destroy_apply_job_id:-}" >&2
  fi
  rm -f "$cookie_jar" "$response_file"
}
trap cleanup EXIT

curl_json() {
  curl -fsS \
    -H "content-type: application/json" \
    -b "$cookie_jar" \
    -c "$cookie_jar" \
    "$@"
}

dump_job_debug() {
  local job_id="$1"

  echo "smoke: job logs id=$job_id" >&2
  curl_json "$API_BASE/jobs/$job_id/logs" >&2 || true
  echo "smoke: overview snapshot" >&2
  curl_json "$API_BASE/overview" >&2 || true
  if [[ -n "${environment_id:-}" ]]; then
    echo "smoke: environment snapshot id=$environment_id" >&2
    curl_json "$API_BASE/environments/$environment_id" >&2 || true
  fi
}

wait_job_done() {
  local job_id="$1"
  local label="$2"
  local deadline
  local queued_deadline
  local seen_non_queued=false
  deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  queued_deadline=$((SECONDS + SMOKE_QUEUED_TIMEOUT_SECONDS))
  while (( SECONDS < deadline )); do
    curl_json "$API_BASE/jobs/$job_id" >"$response_file"
    local status
    status="$(jq -r '.status // empty' "$response_file")"
    case "$status" in
      done)
        echo "smoke: $label job done id=$job_id"
        return 0
        ;;
      failed|cancelled)
        echo "smoke: $label job $status id=$job_id" >&2
        dump_job_debug "$job_id"
        return 1
        ;;
      queued|"")
        if [[ "$seen_non_queued" == "false" && "$SMOKE_QUEUED_TIMEOUT_SECONDS" != "0" && "$SECONDS" -ge "$queued_deadline" ]]; then
          echo "smoke: $label job stayed queued for ${SMOKE_QUEUED_TIMEOUT_SECONDS}s id=$job_id; runner may not be running or cannot claim jobs" >&2
          dump_job_debug "$job_id"
          return 1
        fi
        sleep "$SMOKE_POLL_SECONDS"
        ;;
      running|planning|applying)
        seen_non_queued=true
        sleep "$SMOKE_POLL_SECONDS"
        ;;
      *)
        echo "smoke: $label job status=$status id=$job_id"
        sleep "$SMOKE_POLL_SECONDS"
        ;;
    esac
  done
  echo "smoke: timed out waiting for $label job id=$job_id" >&2
  dump_job_debug "$job_id"
  return 1
}

assert_environment_status() {
  local environment_id="$1"
  local want_status="$2"
  local label="$3"

  curl_json "$API_BASE/environments/$environment_id" >"$response_file"
  local got_status
  got_status="$(jq -r '.status // empty' "$response_file")"
  if [[ "$got_status" != "$want_status" ]]; then
    echo "smoke: $label environment status=$got_status, want=$want_status id=$environment_id" >&2
    cat "$response_file" >&2
    return 1
  fi
  echo "smoke: $label environment status=$got_status id=$environment_id"
}

assert_job_logs() {
  local job_id="$1"
  local label="$2"

  echo "smoke: read final $label logs"
  curl_json "$API_BASE/jobs/$job_id/logs" | jq -e --arg id "$job_id" '.job_id == $id and (.items | length >= 1)' >/dev/null
}

verify_job_websocket() {
  local job_id="$1"
  local label="$2"

  case "$SMOKE_VERIFY_WS" in
    false|FALSE|0|no|NO)
      echo "smoke: skip websocket verification for $label job id=$job_id"
      return 0
      ;;
    auto|AUTO|"")
      if ! command -v go >/dev/null 2>&1; then
        echo "smoke: skip websocket verification for $label job id=$job_id because go is not installed"
        return 0
      fi
      ;;
    true|TRUE|1|yes|YES)
      if ! command -v go >/dev/null 2>&1; then
        echo "go is required when SMOKE_VERIFY_WS=true" >&2
        return 1
      fi
      ;;
  esac

  echo "smoke: verify websocket logs for $label job id=$job_id"
  API_BASE="$API_BASE" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" JOB_ID="$job_id" \
    go run ./cmd/ws-smoke -timeout "${SMOKE_WS_TIMEOUT_SECONDS}s" -required-event log >/dev/null
}

run_destroy_cleanup() {
  local reason="$1"
  destroy_plan_job_id=""
  destroy_apply_job_id=""

  echo "smoke: queue destroy plan ($reason)"
  curl_json \
    -X POST "$API_BASE/environments/$environment_id/destroy" \
    --data "$(jq -n --arg name "$SMOKE_ENV_NAME" --arg reason "$reason" '{confirmation_name:$name,comment:$reason}')" \
    >"$response_file"
  destroy_plan_job_id="$(jq -r '.job.id // empty' "$response_file")"
  if [[ -z "$destroy_plan_job_id" ]]; then
    echo "smoke: destroy response missing plan job id" >&2
    cat "$response_file" >&2
    return 1
  fi
  wait_job_done "$destroy_plan_job_id" destroy-plan
  assert_environment_status "$environment_id" pending_approval destroy-plan
  assert_job_logs "$destroy_plan_job_id" destroy-plan
  verify_job_websocket "$destroy_plan_job_id" destroy-plan

  echo "smoke: approve destroy plan"
  curl_json \
    -X POST "$API_BASE/environments/$environment_id/approve" \
    --data '{"comment":"openstack smoke cleanup approved"}' \
    >/dev/null
  assert_environment_status "$environment_id" approved destroy-approved

  echo "smoke: queue destroy apply"
  curl_json -X POST "$API_BASE/environments/$environment_id/apply" --data '{}' >"$response_file"
  destroy_apply_job_id="$(jq -r '.job.id // empty' "$response_file")"
  if [[ -z "$destroy_apply_job_id" ]]; then
    echo "smoke: destroy apply response missing job id" >&2
    cat "$response_file" >&2
    return 1
  fi
  wait_job_done "$destroy_apply_job_id" destroy-apply
  assert_environment_status "$environment_id" destroyed destroy-apply

  assert_job_logs "$destroy_apply_job_id" destroy-apply
  verify_job_websocket "$destroy_apply_job_id" destroy-apply
}

echo "smoke: health"
if ! curl -fsS "$api_root/healthz" >/dev/null; then
  echo "smoke: API health check failed at $api_root/healthz; start cmd/api or point API_BASE at a running deployment" >&2
  exit 1
fi

echo "smoke: login"
curl_json \
  -X POST "$API_BASE/auth/login" \
  --data "$(jq -n --arg email "$ADMIN_EMAIL" --arg password "$ADMIN_PASSWORD" '{email:$email,password:$password}')" \
  >/dev/null
curl_json "$API_BASE/auth/me" >"$response_file"
if ! jq -e '.is_admin == true' "$response_file" >/dev/null; then
  echo "smoke: ADMIN_EMAIL must belong to an admin user for apply/destroy operations" >&2
  cat "$response_file" >&2
  exit 1
fi
echo "smoke: overview"
curl_json "$API_BASE/overview" >"$response_file"
if jq -e 'has("jobs_queued") or has("jobs_running")' "$response_file" >/dev/null; then
  echo "smoke: job backlog queued=$(jq -r '.jobs_queued // 0' "$response_file") running=$(jq -r '.jobs_running // 0' "$response_file") failed=$(jq -r '.jobs_failed // 0' "$response_file")"
fi

case "$SMOKE_SKIP_PROVIDER_UPSERT" in
  true|TRUE|1|yes|YES)
    echo "smoke: verify existing OpenStack provider $OPENSTACK_CLOUD"
    curl_json "$API_BASE/providers" >"$response_file"
    if ! jq -e --arg name "$OPENSTACK_CLOUD" '.items[]? | select(.name == $name)' "$response_file" >/dev/null; then
      echo "smoke: existing provider $OPENSTACK_CLOUD was not found" >&2
      jq -r '[.items[]?.name] | if length == 0 then "smoke: available providers: -" else "smoke: available providers: \(join(", "))" end' "$response_file" >&2
      exit 1
    fi
    echo "smoke: use existing OpenStack provider $OPENSTACK_CLOUD"
    ;;
  *)
    echo "smoke: upsert OpenStack provider $OPENSTACK_CLOUD"
    curl_json \
      -X POST "$API_BASE/providers" \
      --data "$(jq -n \
        --arg name "$OPENSTACK_CLOUD" \
        --arg auth_url "$OPENSTACK_AUTH_URL" \
        --arg region_name "$OPENSTACK_REGION_NAME" \
        --arg interface "$OPENSTACK_INTERFACE" \
        --arg identity_interface "$OPENSTACK_IDENTITY_INTERFACE" \
        --arg username "$OPENSTACK_USERNAME" \
        --arg password "$OPENSTACK_PASSWORD" \
        --arg project_name "$OPENSTACK_PROJECT_NAME" \
        --arg project_id "$OPENSTACK_PROJECT_ID" \
        --arg user_domain_name "$OPENSTACK_USER_DOMAIN_NAME" \
        --arg project_domain_name "$OPENSTACK_PROJECT_DOMAIN_NAME" \
        --argjson endpoint_override "$OPENSTACK_ENDPOINT_OVERRIDE_JSON" \
        '{name:$name,auth_url:$auth_url,region_name:$region_name,interface:$interface,identity_interface:$identity_interface,username:$username,password:$password,project_name:$project_name,project_id:$project_id,user_domain_name:$user_domain_name,project_domain_name:$project_domain_name,endpoint_override:$endpoint_override}')" \
      >/dev/null
    curl_json "$API_BASE/providers" >"$response_file"
    if ! jq -e --arg name "$OPENSTACK_CLOUD" '.items[]? | select(.name == $name)' "$response_file" >/dev/null; then
      echo "smoke: provider $OPENSTACK_CLOUD was upserted but is not visible in /api/providers" >&2
      cat "$response_file" >&2
      exit 1
    fi
    ;;
esac

echo "smoke: provider preflight"
curl_json -X POST "$API_BASE/providers/$OPENSTACK_CLOUD/preflight" >"$response_file"
if ! jq -e '.ready_for_plan_apply == true' "$response_file" >/dev/null; then
  echo "smoke: provider preflight failed" >&2
  cat "$response_file" >&2
  exit 1
fi

if bool_true "$SMOKE_PREFLIGHT_ONLY" || [[ -z "$SMOKE_IMAGE" || -z "$SMOKE_FLAVOR" || "$SMOKE_SECURITY_GROUPS" == "auto" || "$SMOKE_SECURITY_GROUPS" == "AUTO" || "$SMOKE_SSH_KEY_NAME" == "auto" || "$SMOKE_SSH_KEY_NAME" == "AUTO" ]]; then
  echo "smoke: discover provider resources"
  curl_json "$API_BASE/providers/$OPENSTACK_CLOUD/resources" >"$response_file"
  required_catalogs=(images flavors networks)
  case "$SMOKE_SECURITY_GROUPS" in
    ""|none|NONE)
      ;;
    *)
      required_catalogs+=(security_groups)
      ;;
  esac
  case "$SMOKE_SSH_KEY_NAME" in
    auto|AUTO)
      required_catalogs+=(key_pairs)
      ;;
  esac
  required_catalog_error_pattern="^($(IFS='|'; echo "${required_catalogs[*]}")):"
  if jq -e --arg pattern "$required_catalog_error_pattern" '[.errors[]? | select(test($pattern))] | length > 0' "$response_file" >/dev/null; then
    echo "smoke: provider resource catalog has required-resource errors" >&2
    jq --arg pattern "$required_catalog_error_pattern" '{errors: [.errors[]? | select(test($pattern))]}' "$response_file" >&2
    exit 1
  fi
  if [[ -z "$SMOKE_IMAGE" ]]; then
    SMOKE_IMAGE="$(jq -r '
      ([.image_details[]? | select(((.attributes.status // "active") | ascii_downcase) == "active") | ((.id // "") as $id | if $id != "" then "id:\($id)" else (.name // "") end) | select(. != "")]
      + [.images[]? | select(. != "")]) | first // empty
    ' "$response_file")"
  fi
  if [[ -z "$SMOKE_FLAVOR" ]]; then
    SMOKE_FLAVOR="$(jq -r '
      ([.flavor_details[]? | select(((.attributes.disabled // "false") | tostring | ascii_downcase) != "true") | ((.id // "") as $id | if $id != "" then "id:\($id)" else (.name // "") end) | select(. != "")]
      + [.flavors[]? | select(. != "")]) | first // empty
    ' "$response_file")"
  fi
  if [[ -z "$SMOKE_IMAGE" || -z "$SMOKE_FLAVOR" ]]; then
    echo "smoke: unable to select image/flavor from provider resources" >&2
    jq '{images,flavors,errors}' "$response_file" >&2
    exit 1
  fi
  if [[ "$SMOKE_SECURITY_GROUPS" == "auto" || "$SMOKE_SECURITY_GROUPS" == "AUTO" ]]; then
    SMOKE_SECURITY_GROUPS="$(jq -r '
      ([.security_group_details[]? | .name // ""]
      + [.security_groups[]?])
      | map(select(. == "default"))
      | first // ""
    ' "$response_file")"
  fi
  if [[ "$SMOKE_SSH_KEY_NAME" == "auto" || "$SMOKE_SSH_KEY_NAME" == "AUTO" ]]; then
    SMOKE_SSH_KEY_NAME="$(jq -r '
      ([.key_pair_details[]? | .name // ""]
      + [.key_pairs[]?])
      | map(select(. != ""))
      | first // ""
    ' "$response_file")"
  fi
fi
echo "smoke: using image=$SMOKE_IMAGE flavor=$SMOKE_FLAVOR"
case "$SMOKE_PREFLIGHT_ONLY" in
  true|TRUE|1|yes|YES)
    echo "smoke: preflight ok provider=$OPENSTACK_CLOUD image=${SMOKE_IMAGE:-auto} flavor=${SMOKE_FLAVOR:-auto}"
    exit 0
    ;;
esac
case "$SMOKE_SSH_KEY_NAME" in
  none|NONE)
    SMOKE_SSH_KEY_NAME=""
    ;;
esac
if [[ -n "$SMOKE_SSH_KEY_NAME" ]]; then
  echo "smoke: using ssh_key_name=$SMOKE_SSH_KEY_NAME"
fi
case "$SMOKE_SECURITY_GROUPS" in
  ""|none|NONE)
    security_groups_json="[]"
    ;;
  *)
    security_groups_json="$(jq -cn --arg raw "$SMOKE_SECURITY_GROUPS" '$raw | split(",") | map(gsub("^\\s+|\\s+$"; "")) | map(select(. != ""))')"
    echo "smoke: using security_groups=$SMOKE_SECURITY_GROUPS"
    ;;
esac

echo "smoke: create environment and wait for plan"
curl_json \
  -X POST "$API_BASE/environments" \
  --data "$(jq -n \
    --arg environment_name "$SMOKE_ENV_NAME" \
    --arg tenant_name "$SMOKE_TENANT_NAME" \
    --arg network_name "$SMOKE_NETWORK_NAME" \
    --arg network_cidr "$SMOKE_NETWORK_CIDR" \
    --arg subnet_name "$SMOKE_SUBNET_NAME" \
    --arg image "$SMOKE_IMAGE" \
    --arg flavor "$SMOKE_FLAVOR" \
    --arg ssh_key_name "$SMOKE_SSH_KEY_NAME" \
    --arg instance_name "$SMOKE_INSTANCE_NAME" \
    --argjson count "$SMOKE_INSTANCE_COUNT" \
    --argjson security_groups "$security_groups_json" \
    '{spec:{environment_name:$environment_name,tenant_name:$tenant_name,network:{name:$network_name,cidr:$network_cidr},subnet:{name:$subnet_name,cidr:$network_cidr,enable_dhcp:true},instances:[({name:$instance_name,image:$image,flavor:$flavor,count:$count} + (if $ssh_key_name == "" then {} else {ssh_key_name:$ssh_key_name} end))],security_groups:$security_groups},template_name:"basic"}')" \
  >"$response_file"

environment_id="$(jq -r '.environment.id // empty' "$response_file")"
plan_job_id="$(jq -r '.job.id // empty' "$response_file")"
if [[ -z "$environment_id" || -z "$plan_job_id" ]]; then
  echo "smoke: create response missing environment/job id" >&2
  cat "$response_file" >&2
  exit 1
fi
wait_job_done "$plan_job_id" plan
assert_environment_status "$environment_id" pending_approval plan
assert_job_logs "$plan_job_id" plan
verify_job_websocket "$plan_job_id" plan

echo "smoke: approve environment $environment_id"
curl_json \
  -X POST "$API_BASE/environments/$environment_id/approve" \
  --data '{"comment":"openstack apply smoke"}' \
  >/dev/null
assert_environment_status "$environment_id" approved approved

echo "smoke: queue apply"
curl_json -X POST "$API_BASE/environments/$environment_id/apply" --data '{}' >"$response_file"
apply_job_id="$(jq -r '.job.id // empty' "$response_file")"
if [[ -z "$apply_job_id" ]]; then
  echo "smoke: apply response missing job id" >&2
  cat "$response_file" >&2
  exit 1
fi
if ! wait_job_done "$apply_job_id" apply; then
  case "$SMOKE_DESTROY_ON_APPLY_FAILURE" in
    true|TRUE|1|yes|YES)
      echo "smoke: apply failed; attempting best-effort cleanup" >&2
      run_destroy_cleanup "openstack smoke cleanup after failed apply" || true
      ;;
  esac
  exit 1
fi
assert_environment_status "$environment_id" active apply

assert_job_logs "$apply_job_id" apply
verify_job_websocket "$apply_job_id" apply

case "$SMOKE_DESTROY_AFTER_APPLY" in
  true|TRUE|1|yes|YES)
    run_destroy_cleanup "openstack smoke cleanup"
    ;;
esac

echo "smoke: ok environment_id=$environment_id plan_job_id=$plan_job_id apply_job_id=$apply_job_id destroy_plan_job_id=$destroy_plan_job_id destroy_apply_job_id=$destroy_apply_job_id"
