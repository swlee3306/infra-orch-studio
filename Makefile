GO ?= go
VERIFY_SCRIPT ?= bash hack/verify.sh
IMAGE ?= infra-orch-studio:dev

.PHONY: fmt fmt-check test test-contract vet-contract verify build api runner docker-build smoke-api smoke-ws smoke-openstack-config smoke-openstack-existing-provider-config smoke-openstack-preflight smoke-openstack-existing-provider-preflight smoke-openstack-apply smoke-openstack-existing-provider

fmt:
	$(GO) fmt ./...

fmt-check:
	$(VERIFY_SCRIPT) fmt

test:
	$(GO) test ./...

test-contract:
	$(VERIFY_SCRIPT) test

vet-contract:
	$(VERIFY_SCRIPT) vet

verify:
	$(VERIFY_SCRIPT)

build:
	$(GO) build ./...

api:
	API_ADDR=:8080 $(GO) run ./cmd/api

runner:
	RUNNER_POLL_INTERVAL=5s $(GO) run ./cmd/runner

docker-build:
	docker build -t $(IMAGE) .

smoke-api:
	bash hack/smoke-api-flow.sh

smoke-ws:
	$(GO) run ./cmd/ws-smoke

smoke-openstack-config:
	SMOKE_DRY_RUN_CONFIG=true bash hack/smoke-openstack-apply.sh

smoke-openstack-existing-provider-config:
	SMOKE_SKIP_PROVIDER_UPSERT=true SMOKE_DRY_RUN_CONFIG=true bash hack/smoke-openstack-apply.sh

smoke-openstack-preflight:
	SMOKE_PREFLIGHT_ONLY=true bash hack/smoke-openstack-apply.sh

smoke-openstack-existing-provider-preflight:
	SMOKE_SKIP_PROVIDER_UPSERT=true SMOKE_PREFLIGHT_ONLY=true bash hack/smoke-openstack-apply.sh

smoke-openstack-apply:
	bash hack/smoke-openstack-apply.sh

smoke-openstack-existing-provider:
	SMOKE_SKIP_PROVIDER_UPSERT=true bash hack/smoke-openstack-apply.sh
