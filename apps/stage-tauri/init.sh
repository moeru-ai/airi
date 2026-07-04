#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
cd "$script_dir"

log() {
  printf '[stage-tauri:init] %s\n' "$*"
}

require_command() {
  local command_name="$1"
  local install_hint="$2"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf '[stage-tauri:init] ERROR: %s is required.\n' "$command_name" >&2
    printf '[stage-tauri:init]        %s\n' "$install_hint" >&2
    exit 1
  fi
}

require_file() {
  local file_path="$1"

  if [[ ! -f "$file_path" ]]; then
    printf '[stage-tauri:init] ERROR: missing required scaffold file: %s\n' "$file_path" >&2
    exit 1
  fi
}

require_dir() {
  local dir_path="$1"

  if [[ ! -d "$dir_path" ]]; then
    printf '[stage-tauri:init] ERROR: missing required scaffold directory: %s\n' "$dir_path" >&2
    exit 1
  fi
}

log "checking required tools"
require_command cargo "Install Rust from https://rustup.rs/"
require_command cargo-tauri "Install with: cargo install tauri-cli --version '^2.0'"

log "checking scaffold files"
require_file Cargo.toml
require_file Cargo.lock
require_file build.rs
require_file package.json
require_file tauri.conf.json
require_file tsconfig.json
require_file vite.config.ts
require_file index.html
require_file src/main.rs
require_file src/main.ts
require_file src/App.vue
require_file capabilities/default.json
require_file icons/icon.png
require_dir src/commands

log "checking Tauri CLI version"
cargo tauri --version >/dev/null

log "checking Cargo metadata"
cargo metadata --format-version 1 --no-deps >/dev/null

log "running cargo check"
cargo check

log "ready"
