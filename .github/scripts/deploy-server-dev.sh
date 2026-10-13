#!/usr/bin/env bash

set -euo pipefail

readonly -a SERVICES=(ts-api auth-server)
readonly POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

is_terminal_status() {
  case "$1" in
    SUCCESS | FAILED | CRASHED | REMOVED | SKIPPED) return 0 ;;
    *) return 1 ;;
  esac
}

wait_for_idle_deployments() {
  local service="$1"

  while true; do
    local deployments
    if ! deployments=$(railway deployment list --service "$service" --limit 100 --json); then
      echo "::error::Cannot list the $service deployments." >&2
      return 1
    fi

    local needs_approval
    if ! needs_approval=$(jq 'any(.[]; .status == "NEEDS_APPROVAL")' <<< "$deployments"); then
      echo "::error::Cannot inspect the $service deployment states." >&2
      return 1
    fi

    if [[ "$needs_approval" == "true" ]]; then
      echo "::error::The $service deployment needs approval. Abort it in Railway before resetting Neon." >&2
      return 1
    fi

    local sleeping
    if ! sleeping=$(jq 'any(.[]; .status == "SLEEPING")' <<< "$deployments"); then
      echo "::error::Cannot inspect the $service deployment states." >&2
      return 1
    fi

    if [[ "$sleeping" == "true" ]]; then
      echo "Removing the sleeping $service deployment before the database reset."
      if ! railway down --service "$service" --yes; then
        echo "::error::Cannot remove the sleeping $service deployment." >&2
        return 1
      fi
      sleep "$POLL_INTERVAL_SECONDS"
      continue
    fi

    local active_statuses
    if ! active_statuses=$(jq --raw-output '[.[] | .status | select(IN("SUCCESS", "FAILED", "CRASHED", "REMOVED", "SKIPPED") | not)] | unique | join(", ")' <<< "$deployments"); then
      echo "::error::Cannot read the $service deployment list." >&2
      return 1
    fi

    if [[ -z "$active_statuses" ]]; then
      return 0
    fi

    echo "Waiting for $service deployments with status: $active_statuses"
    sleep "$POLL_INTERVAL_SECONDS"
  done
}

wait_for_new_deployment() {
  local service="$1"
  local previous_id="$2"

  while true; do
    local latest
    if ! latest=$(railway service status --service "$service" --json); then
      echo "::error::Cannot read the $service deployment status." >&2
      return 1
    fi

    local id
    local status
    if ! id=$(jq --exit-status --raw-output '.deploymentId' <<< "$latest") \
      || ! status=$(jq --exit-status --raw-output '.status' <<< "$latest"); then
      echo "::error::The $service deployment status has an invalid shape." >&2
      return 1
    fi

    if [[ "$id" != "$previous_id" ]]; then
      if [[ "$status" == "SUCCESS" ]]; then
        return 0
      fi

      if is_terminal_status "$status"; then
        echo "::error::The $service deployment $id ended with status $status." >&2
        return 1
      fi
    fi

    sleep "$POLL_INTERVAL_SECONDS"
  done
}

select_branch() {
  local edit_failed=0

  for service in "${SERVICES[@]}"; do
    # NOTICE:
    # Project tokens cannot use `railway service source connect`.
    # Railway returns `Unauthorized` before it changes the source branch.
    # Run 38270278514 verified the environment configuration path.
    # Remove this workaround when project tokens can use the source command.
    if ! railway environment edit --service-config "$service" source.branch "$DEPLOY_BRANCH" --message "Select $DEPLOY_BRANCH for server-dev"; then
      echo "::error::Cannot select $DEPLOY_BRANCH for $service." >&2
      edit_failed=1
      break
    fi
  done

  if ((edit_failed != 0)); then
    return 1
  fi

  # The source change blocks new deploys from the old branch. Drain every
  # deployment that started before the change before Neon resets the database.
  for service in "${SERVICES[@]}"; do
    if ! wait_for_idle_deployments "$service"; then
      return 1
    fi
  done
}

deploy_services() {
  for service in "${SERVICES[@]}"; do
    local previous
    if ! previous=$(railway service status --service "$service" --json | jq --exit-status --raw-output '.deploymentId'); then
      echo "::error::Cannot read the current $service deployment." >&2
      return 1
    fi

    if ! railway service redeploy --service "$service" --from-source --yes; then
      echo "::error::Cannot redeploy $service." >&2
      wait_for_idle_deployments "$service"
      return 1
    fi

    if ! wait_for_new_deployment "$service" "$previous"; then
      return 1
    fi
  done
}

deploy_frontend() {
  local dispatch_token="server-dev-${GITHUB_RUN_ID:-manual}-${GITHUB_RUN_ATTEMPT:-1}"
  local frontend_run_title="Deploy server-dev frontend ($dispatch_token)"
  local frontend_run_url
  if ! frontend_run_url=$(gh workflow run deploy-cloudflare-workers-dev-server.yml --repo "$GH_REPOSITORY" --ref "$DEPLOY_BRANCH" --raw-field "dispatch_token=$dispatch_token"); then
    echo "::error::Cannot start the frontend workflow." >&2
    return 1
  fi

  local frontend_run_id="${frontend_run_url##*/}"
  if [[ ! "$frontend_run_id" =~ ^[0-9]+$ ]]; then
    for _ in {1..20}; do
      local frontend_runs
      if ! frontend_runs=$(gh run list --repo "$GH_REPOSITORY" --workflow deploy-cloudflare-workers-dev-server.yml --branch "$DEPLOY_BRANCH" --event workflow_dispatch --limit 100 --json databaseId,displayTitle); then
        echo "::error::Cannot list frontend workflow runs." >&2
        return 1
      fi

      if ! frontend_run_id=$(jq --arg title "$frontend_run_title" --raw-output '[.[] | select(.displayTitle == $title)][0].databaseId // empty' <<< "$frontend_runs"); then
        echo "::error::Cannot read frontend workflow runs." >&2
        return 1
      fi

      if [[ "$frontend_run_id" =~ ^[0-9]+$ ]]; then
        break
      fi

      sleep "$POLL_INTERVAL_SECONDS"
    done
  fi

  if [[ ! "$frontend_run_id" =~ ^[0-9]+$ ]]; then
    echo "::error::Cannot find the frontend workflow run for $dispatch_token." >&2
    return 1
  fi

  gh run watch "$frontend_run_id" --repo "$GH_REPOSITORY" --exit-status --compact
}

case "${1:-}" in
  select-branch) select_branch ;;
  deploy-services) deploy_services ;;
  deploy-frontend) deploy_frontend ;;
  *)
    echo "Usage: $0 {select-branch|deploy-services|deploy-frontend}" >&2
    exit 2
    ;;
esac
