GO ?= go
VERIFY_SCRIPT ?= bash hack/verify.sh

.PHONY: fmt fmt-check test test-contract vet-contract verify build api runner

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
