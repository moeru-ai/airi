#! /usr/bin/env bash

set -eux

cd "$(dirname "${BASH_SOURCE[0]}")"
:> pnpm-deps-hash.txt # Clear hash to trigger rebuild
BUILD_LOG="$(mktemp)"
nix build -L ..#airi.pnpmDeps |& tee "$BUILD_LOG"
HASH="$(grep -aoP 'got: +\Ksha256-\S{43}=' "$BUILD_LOG")"
[ -n "$HASH" ] && echo "$HASH" > pnpm-deps-hash.txt
