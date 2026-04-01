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

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl tar mariadb-client \
  && rm -rf /var/lib/apt/lists/*

# Install OpenTofu (runner)
ARG TOFU_VERSION=1.11.0
RUN curl --fail --silent --show-error --location --retry 8 --retry-all-errors --retry-delay 2 --connect-timeout 10 --max-time 300 --http1.1 -o /tmp/tofu.zip "https://github.com/opentofu/opentofu/releases/download/v${TOFU_VERSION}/tofu_${TOFU_VERSION}_linux_amd64.zip" \
  && apt-get update && apt-get install -y --no-install-recommends unzip \
  && unzip /tmp/tofu.zip -d /usr/local/bin \
  && rm -f /tmp/tofu.zip \
  && apt-get purge -y --auto-remove unzip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=build /out/infra-orch-api /app/infra-orch-api
COPY --from=build /out/infra-orch-runner /app/infra-orch-runner

# default to API
EXPOSE 8080
ENTRYPOINT ["/app/infra-orch-api"]
