#!/usr/bin/env bash
# Builds the documentation site from moeru-ai/airi-docs with the `/docs/` base,
# then copies the output to the given directory.
#
# Usage: scripts/build-airi-docs.sh <out-dir>
#
# Environment variables:
# - AIRI_DOCS_DIR: existing checkout to build, cloned when missing (default: airi-docs)
# - AIRI_DOCS_REF: branch or tag to clone (default: main)
# - AIRI_VERSION: version shown in the docs navbar (default: version in package.json)
#
# NOTICE: the page changelogs are generated from Git history. The clone here is
# shallow, so a full history checkout must be passed in through AIRI_DOCS_DIR
# when the changelogs matter, as the production deploy workflow does.
set -euo pipefail

out_dir="${1:?usage: scripts/build-airi-docs.sh <out-dir>}"
docs_dir="${AIRI_DOCS_DIR:-airi-docs}"

if [ ! -d "$docs_dir/.git" ]; then
  git clone --depth 1 --branch "${AIRI_DOCS_REF:-main}" https://github.com/moeru-ai/airi-docs.git "$docs_dir"
fi

AIRI_VERSION="${AIRI_VERSION:-$(node -p "require('./package.json').version")}"
export AIRI_VERSION

pnpm -C "$docs_dir" install --frozen-lockfile
pnpm -C "$docs_dir" run build:base

rm -rf "$out_dir"
mkdir -p "$(dirname "$out_dir")"
cp -R "$docs_dir/.vitepress/dist" "$out_dir"
