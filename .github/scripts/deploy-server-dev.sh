#!/usr/bin/env bash

set -euo pipefail

readonly -a SERVICES=(ts-api auth-server)
readonly POLL_INTERVAL_SECONDS="${POLL_INTERVAL_SECONDS:-15}"

poll_delay() {
  sleep "$POLL_INTERVAL_SECONDS" &
  wait "$!"
}

is_terminal_status() {
  case "$1" in
    SUCCESS | FAILED | CRASHED | REMOVED | SKIPPED) return 0 ;;
    *) return 1 ;;
  esac
}

linked_environment_id() {
  local environments
  if ! environments=$(railway environment list --json); then
    echo "::error::Cannot list Railway environments." >&2
    return 1
  fi

  jq --exit-status --raw-output '[.environments[] | select(.isLinked)] | if length == 1 then .[0].id else error("expected one linked environment") end' <<< "$environments"
}

railway_project_id() {
  railway status --json | jq --exit-status --raw-output '.id'
}

railway_service_id() {
  railway service status --service "$1" --json | jq --exit-status --raw-output '.id'
}

autodeploy_enabled() {
  local project_id="$1"
  local environment_id="$2"
  local service_id="$3"
  local query="query AutodeployStatus(\$projectId: String!, \$environmentId: String!, \$serviceId: String!) { serviceInstanceAutoDeployStatus(projectId: \$projectId, environmentId: \$environmentId, serviceId: \$serviceId) { enabled } }"
  local response
  response=$(railway api "$query" --raw-var "projectId=$project_id" --raw-var "environmentId=$environment_id" --raw-var "serviceId=$service_id" --compact)
  jq --raw-output '.data.serviceInstanceAutoDeployStatus.enabled | if type == "boolean" then . else error("invalid autodeploy status") end' <<< "$response"
}

set_autodeploy() {
  local project_id="$1"
  local environment_id="$2"
  local service_id="$3"
  local enabled="$4"
  local mutation="mutation SetAutodeploy(\$projectId: String!, \$environmentId: String!, \$serviceId: String!, \$enabled: Boolean!) { serviceInstanceAutoDeployUpdate(input: { projectId: \$projectId, environmentId: \$environmentId, serviceId: \$serviceId, enabled: \$enabled }) { enabled } }"
  local response
  response=$(railway api "$mutation" --raw-var "projectId=$project_id" --raw-var "environmentId=$environment_id" --raw-var "serviceId=$service_id" --var "enabled=$enabled" --compact)

  local actual
  actual=$(jq --raw-output '.data.serviceInstanceAutoDeployUpdate.enabled | if type == "boolean" then . else error("invalid autodeploy result") end' <<< "$response")
  [[ "$actual" == "$enabled" ]]
}

disable_autodeploys() {
  local project_id
  local environment_id
  if ! project_id=$(railway_project_id) || ! environment_id=$(linked_environment_id); then
    echo "::error::Cannot identify the linked Railway project and environment." >&2
    return 1
  fi

  for service in "${SERVICES[@]}"; do
    local service_id
    local enabled
    if ! service_id=$(railway_service_id "$service") \
      || ! enabled=$(autodeploy_enabled "$project_id" "$environment_id" "$service_id"); then
      echo "::error::Cannot read autodeploy for $service." >&2
      return 1
    fi
    if [[ "$enabled" == "true" ]] && ! set_autodeploy "$project_id" "$environment_id" "$service_id" false; then
      echo "::error::Cannot disable autodeploy for $service." >&2
      return 1
    fi
  done
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
      poll_delay
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
    poll_delay
  done
}

wait_for_deployment() {
  local service="$1"
  local deployment_id="$2"

  while true; do
    local deployments
    if ! deployments=$(railway deployment list --service "$service" --limit 100 --json); then
      echo "::error::Cannot list the $service deployments." >&2
      return 1
    fi

    local status
    if ! status=$(jq --arg id "$deployment_id" --exit-status --raw-output '[.[] | select(.id == $id)][0].status' <<< "$deployments"); then
      poll_delay
      continue
    fi

    if [[ "$status" == "SUCCESS" ]]; then
      return 0
    fi

    if is_terminal_status "$status"; then
      echo "::error::The $service deployment $deployment_id ended with status $status." >&2
      return 1
    fi

    poll_delay
  done
}

wait_for_terminal_deployment() {
  local service="$1"
  local deployment_id="$2"

  while true; do
    local deployments
    if ! deployments=$(railway deployment list --service "$service" --limit 100 --json); then
      echo "::error::Cannot list the $service deployments." >&2
      return 1
    fi

    local status
    if ! status=$(jq --arg id "$deployment_id" --exit-status --raw-output '[.[] | select(.id == $id)][0].status' <<< "$deployments"); then
      poll_delay
      continue
    fi

    if is_terminal_status "$status"; then
      return 0
    fi

    poll_delay
  done
}

cancel_railway_deployment() {
  local service="$1"
  local deployment_id="$2"
  local mutation="mutation CancelDeployment(\$id: String!) { deploymentCancel(id: \$id) }"

  echo "Cancelling Railway deployment $deployment_id for $service." >&2
  railway api "$mutation" --raw-var "id=$deployment_id" --compact || true
  wait_for_terminal_deployment "$service" "$deployment_id" || true
}

select_branch() {
  local edit_failed=0

  for service in "${SERVICES[@]}"; do
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
  local environment_id
  if ! environment_id=$(linked_environment_id); then
    echo "::error::Cannot identify the linked Railway environment." >&2
    return 1
  fi

  for service in "${SERVICES[@]}"; do
    local service_id
    if ! service_id=$(railway_service_id "$service"); then
      echo "::error::Cannot identify the $service service ID." >&2
      return 1
    fi

    local deploy_mutation="mutation DeployCommit(\$environmentId: String!, \$serviceId: String!, \$commitSha: String!) { serviceInstanceDeployV2(environmentId: \$environmentId, serviceId: \$serviceId, commitSha: \$commitSha) }"
    local deployment
    if ! deployment=$(railway api "$deploy_mutation" --raw-var "environmentId=$environment_id" --raw-var "serviceId=$service_id" --raw-var "commitSha=$DEPLOY_SHA" --compact); then
      echo "::error::Cannot redeploy $service." >&2
      wait_for_idle_deployments "$service"
      return 1
    fi

    local deployment_id
    if ! deployment_id=$(jq --exit-status --raw-output '.data.serviceInstanceDeployV2 | select(type == "string" and length > 0)' <<< "$deployment"); then
      echo "::error::Railway did not return the $service deployment ID." >&2
      wait_for_idle_deployments "$service"
      return 1
    fi

    abort_railway_deployment() {
      local exit_status="$1"
      trap - EXIT INT TERM
      cancel_railway_deployment "$service" "$deployment_id"
      exit "$exit_status"
    }

    trap 'cancel_railway_deployment "$service" "$deployment_id"' EXIT
    trap 'abort_railway_deployment 130' INT
    trap 'abort_railway_deployment 143' TERM

    local wait_status=0
    wait_for_deployment "$service" "$deployment_id" || wait_status=$?
    trap - EXIT INT TERM
    if ((wait_status != 0)); then
      cancel_railway_deployment "$service" "$deployment_id"
      return 1
    fi

    if ! wait_for_idle_deployments "$service"; then
      return 1
    fi
  done
}

deploy_frontend() {
  local parent_run_id="${GITHUB_RUN_ID:-manual}"
  local dispatch_token="server-dev-${parent_run_id}-${GITHUB_RUN_ATTEMPT:-1}"
  local frontend_run_title="Deploy server-dev frontend ($dispatch_token)"
  local workflow_ref="${GITHUB_REF_NAME:-main}"
  local frontend_run_url
  if ! frontend_run_url=$(gh workflow run deploy-cloudflare-workers-dev-server.yml --repo "$GH_REPOSITORY" --ref "$workflow_ref" --raw-field "branch=$DEPLOY_BRANCH" --raw-field "commit_sha=$DEPLOY_SHA" --raw-field "parent_run_id=$parent_run_id" --raw-field "dispatch_token=$dispatch_token"); then
    echo "::error::Cannot start the frontend workflow." >&2
    return 1
  fi

  local frontend_run_id="${frontend_run_url##*/}"
  if [[ ! "$frontend_run_id" =~ ^[0-9]+$ ]]; then
    while [[ ! "$frontend_run_id" =~ ^[0-9]+$ ]]; do
      local frontend_runs
      if ! frontend_runs=$(gh run list --repo "$GH_REPOSITORY" --workflow deploy-cloudflare-workers-dev-server.yml --branch "$workflow_ref" --event workflow_dispatch --limit 100 --json databaseId,displayTitle); then
        echo "::warning::Cannot list frontend workflow runs. Retrying." >&2
        poll_delay
        continue
      fi

      if ! frontend_run_id=$(jq --arg title "$frontend_run_title" --raw-output '[.[] | select(.displayTitle == $title)][0].databaseId // empty' <<< "$frontend_runs"); then
        echo "::error::Cannot read frontend workflow runs." >&2
        return 1
      fi

      if [[ "$frontend_run_id" =~ ^[0-9]+$ ]]; then
        break
      fi

      poll_delay
    done
  fi

  if [[ ! "$frontend_run_id" =~ ^[0-9]+$ ]]; then
    echo "::error::Cannot find the frontend workflow run for $dispatch_token." >&2
    return 1
  fi

  local watcher_pid=""

  cancel_frontend_run() {
    trap - EXIT INT TERM
    if [[ -n "$watcher_pid" ]] && kill -0 "$watcher_pid" 2>/dev/null; then
      kill "$watcher_pid" 2>/dev/null || true
      wait "$watcher_pid" 2>/dev/null || true
    fi
    echo "Cancelling frontend workflow run $frontend_run_id." >&2
    gh run cancel "$frontend_run_id" --repo "$GH_REPOSITORY" || true
    gh run watch "$frontend_run_id" --repo "$GH_REPOSITORY" --exit-status --compact || true
  }

  abort_frontend_run() {
    local exit_status="$1"
    cancel_frontend_run
    exit "$exit_status"
  }

  # The child workflow runs outside this job. Cancel it if GitHub stops the
  # parent or if the watcher exits before the child succeeds.
  trap cancel_frontend_run EXIT
  trap 'abort_frontend_run 130' INT
  trap 'abort_frontend_run 143' TERM

  local watch_status=0
  gh run watch "$frontend_run_id" --repo "$GH_REPOSITORY" --exit-status --compact &
  watcher_pid=$!
  wait "$watcher_pid" || watch_status=$?
  if ((watch_status != 0)); then
    cancel_frontend_run
    trap - EXIT INT TERM
    return "$watch_status"
  fi

  trap - EXIT INT TERM
}

case "${1:-}" in
  disable-autodeploys) disable_autodeploys ;;
  select-branch) select_branch ;;
  deploy-services) deploy_services ;;
  deploy-frontend) deploy_frontend ;;
  *)
    echo "Usage: $0 {disable-autodeploys|select-branch|deploy-services|deploy-frontend}" >&2
    exit 2
    ;;
esac
