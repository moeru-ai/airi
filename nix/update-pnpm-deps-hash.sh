#! /usr/bin/env bash

set -eux

cd "$(dirname "${BASH_SOURCE[0]}")"
:> pnpm-deps-hash.txt # Clear hash to trigger rebuild
# Redirect stderr to stdout for grep while keeping printing on stderr
HASH=$(nix build ..#airi.pnpmDeps 2> >(tee /dev/tty) | grep -oP 'got: +\K\S+')
echo -n $HASH > pnpm-deps-hash.txt
