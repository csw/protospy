#!/usr/bin/env bash
# Exercise the running compose stack: flix, the elasticsearch passing through
# protospy, and protospy's own info endpoint. Each request prints its label
# before running so a failure points at the exact endpoint.
set -euo pipefail

current=""
on_exit() {
  local rc=$?
  if [[ $rc -ne 0 && -n "$current" ]]; then
    echo "smoke test FAILED at: ${current}" >&2
  fi
}
trap on_exit EXIT

check() {
  current=$1
  shift
  status=$(curl --fail --silent --show-error --output /dev/null --write-out '%{http_code}' "$@")
  echo "ok: ${current} (HTTP ${status})"
}

check "flix /health"                    http://localhost:8001/health
check "protospy/ES /_cluster/health"    http://localhost:3001/_cluster/health
check "flix /search?q=test"             'http://localhost:8001/search?q=test'
check "protospy /info"                  http://localhost:3101/info
