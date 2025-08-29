#! /usr/bin/env bash

set -eux

ROOT="$(dirname "$(readlink -f "$0")")"

:> "$ROOT/pnpm-deps-hash.txt" # Clear hash
HASH=$(nix build "$ROOT/..#airi.pnpmDeps" |& grep -oP 'got: +\K\S+')
echo -n $HASH > "$ROOT/pnpm-deps-hash.txt"
