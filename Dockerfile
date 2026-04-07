# syntax=docker/dockerfile:1

FROM golang:1.25 AS build
WORKDIR /src

COPY go.mod go.sum ./
COPY third_party ./third_party/
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/infra-orch-api ./cmd/api
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/infra-orch-runner ./cmd/runner

# Runtime image
FROM debian:bookworm-slim
WORKDIR /app

RUN apt-get -o Acquire::ForceIPv4=true update \
  && apt-get -o Acquire::ForceIPv4=true install -y --no-install-recommends ca-certificates curl tar mariadb-client \
  && rm -rf /var/lib/apt/lists/*

# OpenTofu (runner)
# Provided by CI as hack/tofu (so docker build does not depend on external network)
COPY hack/tofu /usr/local/bin/tofu
RUN chmod +x /usr/local/bin/tofu && tofu version || true


COPY --from=build /out/infra-orch-api /app/infra-orch-api
COPY --from=build /out/infra-orch-runner /app/infra-orch-runner
COPY templates /app/templates

# default to API
EXPOSE 8080
ENTRYPOINT ["/app/infra-orch-api"]
