# Configuration Reference

## Overview

This project uses three kinds of configuration:

- runtime environment variables
- Kubernetes ConfigMaps
- Kubernetes Secrets

## API Runtime

| Key | Required | Purpose |
| --- | --- | --- |
| `API_ADDR` | yes | HTTP listen address for the API process |
| `MYSQL_HOST` | yes | MySQL host |
| `MYSQL_PORT` | yes | MySQL port |
| `MYSQL_DB` | yes | MySQL database name |
| `MYSQL_USER` | yes | MySQL username |
| `MYSQL_PASSWORD` | yes | MySQL password |
| `MYSQL_BIN` | no | mysql client path used by the store layer |
| `ADMIN_EMAIL` | no | Admin seed account email |
| `ADMIN_PASSWORD` | no | Admin seed account password |
| `ALLOW_PUBLIC_SIGNUP` | no | Enables open self-service signup when set to `true` |

Notes:
- `ADMIN_EMAIL` and `ADMIN_PASSWORD` are optional, but they must be set together.
- When both are set, the API upserts an admin account during startup before serving traffic.
- `ALLOW_PUBLIC_SIGNUP` defaults to `false`.
- The API also validates `TEMPLATES_ROOT`, `MODULES_ROOT`, and the default `basic` environment template files during startup.

## Runner Runtime

| Key | Required | Purpose |
| --- | --- | --- |
| `MYSQL_HOST` | yes | MySQL host |
| `MYSQL_PORT` | yes | MySQL port |
| `MYSQL_DB` | yes | MySQL database name |
| `MYSQL_USER` | yes | MySQL username |
| `MYSQL_PASSWORD` | yes | MySQL password |
| `MYSQL_BIN` | no | mysql client path used by the store layer |
| `TOFU_BIN` | no | OpenTofu binary path |
| `TEMPLATES_ROOT` | no | Template root directory |
| `MODULES_ROOT` | no | Module root directory |
| `WORKDIRS_ROOT` | no | Persistent runner workdir root |
| `OPENSTACK_CLOUD` | no | OpenStack cloud name |
| `OPENSTACK_CONFIG_PATH` | no | Path to `clouds.yaml` inside the container |

## Web Runtime

| Key | Required | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | build-time | API base URL baked into the static app |

## Kubernetes Objects

### Secrets

- `infra-orch-mysql`
  - MySQL connection credentials used by API and runner.
  - For MySQL itself, also includes `MYSQL_ROOT_PASSWORD`.
- `infra-orch-admin`
  - Admin seed credentials for the API.
- `openstack-clouds`
  - Runner OpenStack authentication file mounted as `/etc/openstack/clouds.yaml`.

### ConfigMaps

- `infra-orch-runtime`
  - Shared non-secret runtime values for API and runner.

### Volumes

- `infra-orch-workdirs`
  - Persistent runner workdir storage.
  - Holds rendered templates, plan artifacts, and streamed logs for environment jobs.

## Environment Overlay Defaults

### Dev

- Single replica workloads.
- Web service exposed through NodePort for quick access.

### Stage

- Production-like service wiring.
- Ingress exposed for host-based validation.

### Prod

- Production-like replicas and ingress.
- Intended for the promoted image tag from CI.

## Notes

- The OpenStack secret is the operator's responsibility and must contain a valid `clouds.yaml`.
- The runner workdir PVC must be bound before processing jobs.
- The web app uses Nginx to proxy `/api` and `/ws`; the API service must remain reachable inside the cluster.
- Environment lifecycle state lives in MySQL. The PVC is for execution artifacts, not as the source of truth for approval or status.
- Environment-managed plan/apply flows must use `/api/environments/*`; `/api/jobs/*` remains a legacy execution surface for backward compatibility.
- The runner validates `TEMPLATES_ROOT`, `MODULES_ROOT`, and the default `basic` template contract during startup before polling jobs.
