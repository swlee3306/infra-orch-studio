GO ?= go

.PHONY: fmt test build api runner

fmt:
	$(GO) fmt ./...

test:
	$(GO) test ./...

build:
	$(GO) build ./...

api:
	API_ADDR=:8080 $(GO) run ./cmd/api

runner:
	RUNNER_POLL_INTERVAL=5s $(GO) run ./cmd/runner
