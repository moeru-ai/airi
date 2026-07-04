#!/usr/bin/env bash
set -euo pipefail

# AIRI Tauri Port — Environment Setup
# Must be idempotent. Runs at the start of each worker session.

echo "[init] Installing workspace dependencies..."
pnpm install

echo "[init] Checking Rust toolchain..."
if ! command -v cargo &>/dev/null; then
  echo "[init] ERROR: cargo not found. Install Rust toolchain:"
  echo "       curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
  echo "       rustup target add wasm32-unknown-unknown"
  exit 1
fi

if ! command -v cargo-tauri &>/dev/null; then
  echo "[init] Installing cargo-tauri..."
  cargo install tauri-cli --version "^2.0"
fi

echo "[init] Checking for Xcode command line tools (Apple platforms)..."
if [[ "$(uname)" == "Darwin" ]]; then
  if ! xcode-select -p &>/dev/null; then
    echo "[init] WARNING: Xcode Command Line Tools not found. macOS builds will fail."
    echo "       Install with: xcode-select --install"
  fi
fi

echo "[init] Checking Tauri system dependencies (Linux)..."
if [[ "$(uname)" == "Linux" ]]; then
  missing=()
  for pkg in libwebkit2gtk-4.1-dev libgtk-3-dev libssl-dev patchelf; do
    if ! ldconfig -p 2>/dev/null | grep -q "${pkg%%-dev}"; then
      missing+=("$pkg")
    fi
  done
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "[init] WARNING: Tauri Linux dependencies may be missing: ${missing[*]}"
    echo "       Install on CachyOS with: sudo pacman -S ${missing[*]}"
  fi
fi

echo "[init] Generating pnpm catalog approvals..."
pnpm approve-builds 2>/dev/null || true

echo "[init] Building packages needed for Tauri..."
pnpm -F @proj-airi/stage-ui build 2>/dev/null || true
pnpm -F @proj-airi/stage-shared build 2>/dev/null || true

echo "[init] Running Rust check..."
if [[ -d "apps/stage-tauri" ]]; then
  cd apps/stage-tauri
  cargo check 2>/dev/null || true
  cd ../..
else
  echo "[init] apps/stage-tauri/ not yet created (scaffold as part of features)."
fi

echo "[init] Environment ready."
