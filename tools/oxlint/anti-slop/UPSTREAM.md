# Upstream source

- Repository: https://github.com/dmmulroy/anti-slop
- Commit: `c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b`
- Source: `src/`, excluding the optional `effect/` directory.
- Destination: `tools/oxlint/anti-slop/`.
- License: MIT. The root license and nested ESLint Stylistic license are included.

The rule source and upstream tests are unchanged. Source extensions are retained because these files use the upstream TypeScript runtime entry points.
AIRI excludes this directory from lint formatting to preserve a recoverable upstream snapshot.

AIRI policy lives in `.oxlintrc.json` and `eslint.config.ts`.
See [the integration notes](../README.md) for disabled rules, overlap, and validation commands.

For updates, compare this commit with the requested upstream revision before replacing files. Preserve local policy and both license records.
