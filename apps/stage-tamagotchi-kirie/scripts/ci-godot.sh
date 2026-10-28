#!/usr/bin/env bash
set -euo pipefail
godot_command="${GODOT:-}"
if [ -z "$godot_command" ]; then
  godot_command="$(mise which godot)"
fi
if [[ "${RUNNER_OS:-}" == "Windows" ]]; then
  godot_command="$(cygpath -u "$godot_command")"
fi
printf '%s\n' "$godot_command"
