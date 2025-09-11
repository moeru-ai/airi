#! /usr/bin/env bash

set -eux

cd "$(dirname "${BASH_SOURCE[0]}")"
# Set fake hash to trigger rebuild
echo -n "sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=" > assets-hash.txt
# Redirect stderr to stdout for grep while keeping printing on stderr
HASH=$(nix build ..#airi.assets 2> >(tee /dev/tty) | grep -oP 'got: +\K\S+')
echo -n $HASH > assets-hash.txt
