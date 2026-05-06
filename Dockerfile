# syntax=docker/dockerfile:1

FROM golang:1.25 AS build
WORKDIR /src

ARG TARGETOS=linux
ARG TARGETARCH

COPY go.mod go.sum ./
COPY third_party ./third_party/
RUN go mod download

COPY . .

RUN target_arch="${TARGETARCH:-$(go env GOHOSTARCH)}" \
  && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${target_arch} go build -o /out/infra-orch-api ./cmd/api
RUN target_arch="${TARGETARCH:-$(go env GOHOSTARCH)}" \
  && CGO_ENABLED=0 GOOS=${TARGETOS} GOARCH=${target_arch} go build -o /out/infra-orch-runner ./cmd/runner

# Runtime image
FROM debian:bookworm-slim
WORKDIR /app

ARG OPENTOFU_VERSION=1.10.6
ARG TARGETARCH

RUN apt-get -o Acquire::ForceIPv4=true update \
  && apt-get -o Acquire::ForceIPv4=true install -y --no-install-recommends ca-certificates curl tar unzip mariadb-client \
  && rm -rf /var/lib/apt/lists/*

# OpenTofu is required by the runner image path.
RUN target_arch="${TARGETARCH:-$(dpkg --print-architecture)}" \
  && case "${target_arch}" in \
    amd64|arm64) tofu_arch="${target_arch}" ;; \
    *) echo "unsupported TARGETARCH=${target_arch}" >&2; exit 1 ;; \
  esac \
  && curl --retry 5 --retry-delay 2 --retry-all-errors -fsSL -o /tmp/tofu.zip "https://github.com/opentofu/opentofu/releases/download/v${OPENTOFU_VERSION}/tofu_${OPENTOFU_VERSION}_linux_${tofu_arch}.zip" \
  && unzip -q /tmp/tofu.zip -d /usr/local/bin tofu \
  && chmod +x /usr/local/bin/tofu \
  && rm -f /tmp/tofu.zip \
  && tofu version

COPY --from=build /out/infra-orch-api /app/infra-orch-api
COPY --from=build /out/infra-orch-runner /app/infra-orch-runner
COPY templates /app/templates

# default to API
EXPOSE 8080
ENTRYPOINT ["/app/infra-orch-api"]
