#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

GO_PACKAGES=(
  ./internal/api
  ./internal/api/handlers
  ./internal/domain
  ./internal/executor
  ./internal/renderer
  ./internal/security
  ./internal/storage
  ./internal/storage/sqlite
  ./internal/validation
)

GO_FILES=(
  $(find ./cmd ./internal -name '*.go' -not -path './internal/storage/mysql/*' -not -path './third_party/*' | sort)
)

fmt_check() {
  if [ "${#GO_FILES[@]}" -eq 0 ]; then
    echo "no go files found"
    return 0
  fi

  local bad
  bad="$(gofmt -l "${GO_FILES[@]}")"
  if [ -n "$bad" ]; then
    echo "gofmt is required for:"
    printf '%s\n' "$bad"
    exit 1
  fi
}

vet_check() {
  go vet "${GO_PACKAGES[@]}"
}

test_check() {
  go test "${GO_PACKAGES[@]}"
}

kustomize_check() {
  local builder=""
  if command -v kustomize >/dev/null 2>&1; then
    builder="kustomize build"
  elif command -v kubectl >/dev/null 2>&1; then
    builder="kubectl kustomize"
  else
    echo "skip kustomize validation: no kustomize or kubectl found"
    return 0
  fi

  local path
  for path in k8s/app/base k8s/app/overlays/dev k8s/app/overlays/stage k8s/app/overlays/prod; do
    echo "validate ${path}"
    ${builder} "${path}" >/dev/null
  done
}

case "${1:-verify}" in
  fmt)
    fmt_check
    ;;
  vet)
    vet_check
    ;;
  test)
    test_check
    ;;
  verify)
    fmt_check
    vet_check
    test_check
    kustomize_check
    ;;
  *)
    echo "usage: $0 [fmt|vet|test|verify]"
    exit 2
    ;;
esac
