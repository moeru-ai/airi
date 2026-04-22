#!/usr/bin/env bash

set -euo pipefail

LESSON_BACKEND_URL="http://127.0.0.1:9625"
LESSON_BACKEND_TIMEOUT_SECONDS=60

append_lesson_backend_auth_args() {
  local bearer_token="${VITE_PEPTUTOR_LESSON_BEARER_TOKEN:-${VITE_PEPTUTOR_LESSON_ACCESS_TOKEN:-}}"
  local api_key="${VITE_PEPTUTOR_LESSON_API_KEY:-}"
  local username="${VITE_PEPTUTOR_LESSON_AUTH_USERNAME:-}"
  local password="${VITE_PEPTUTOR_LESSON_AUTH_PASSWORD:-}"

  if [[ -n "${bearer_token}" ]]; then
    printf '%s\0' -H "Authorization: Bearer ${bearer_token}"
    return
  fi

  if [[ -n "${api_key}" ]]; then
    printf '%s\0' -H "X-API-Key: ${api_key}"
    return
  fi

  if [[ -n "${username}" && -n "${password}" ]]; then
    printf '%s\0' -u "${username}:${password}"
  fi
}

should_bypass_proxy() {
  local url="$1"
  local authority="${url#*://}"
  authority="${authority%%/*}"
  authority="${authority#*@}"

  case "${authority}" in
    localhost|localhost:*|127.0.0.1|127.0.0.1:*|::1|::1:*|'[::1]'|'[::1]':*)
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

usage() {
  cat <<'EOF'
Usage: scripts/wait-for-lesson-backend.sh [--url URL] [--timeout SECONDS]

Wait until the lesson backend answers GET /lesson/catalog with HTTP 200.

Options:
  --url URL         Base URL for the lesson backend.
  --timeout SEC     Timeout in seconds. Default: 60
  -h, --help        Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --url)
      LESSON_BACKEND_URL="${2:?missing value for --url}"
      shift 2
      ;;
    --timeout)
      LESSON_BACKEND_TIMEOUT_SECONDS="${2:?missing value for --timeout}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

readonly lesson_catalog_url="${LESSON_BACKEND_URL%/}/lesson/catalog"
readonly start_epoch="$(date +%s)"
curl_args=()

if should_bypass_proxy "${lesson_catalog_url}"; then
  curl_args+=(--noproxy '*')
fi

while IFS= read -r -d '' auth_arg; do
  curl_args+=("${auth_arg}")
done < <(append_lesson_backend_auth_args)

while true; do
  if curl -fsS --max-time 5 "${curl_args[@]}" "${lesson_catalog_url}" >/dev/null 2>&1; then
    elapsed="$(( $(date +%s) - start_epoch ))"
    echo "Lesson backend ready after ${elapsed}s: ${lesson_catalog_url}"
    exit 0
  fi

  now_epoch="$(date +%s)"
  if (( now_epoch - start_epoch >= LESSON_BACKEND_TIMEOUT_SECONDS )); then
    echo "Timed out after ${LESSON_BACKEND_TIMEOUT_SECONDS}s waiting for lesson backend: ${lesson_catalog_url}" >&2
    exit 1
  fi

  sleep 1
done
