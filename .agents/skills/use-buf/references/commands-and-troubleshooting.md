# Buf Commands and Troubleshooting

## Required Checks

Run from the configured workspace root:

```sh
buf lint
buf generate
buf breaking --against '.git#branch=main'
```

Also use:

```sh
buf format --diff
buf build
buf dep graph --format json
git diff --exit-code
git status --short
```

If generation uses domain templates, run every affected template with `buf generate --template <template>`.
Use both Git commands because `git diff` alone does not report newly generated untracked files.

## Missing Import or Type

1. Confirm the import path spelling and module source roots.
2. Confirm the dependency exists in `buf.yaml`.
3. Inspect `buf.lock` and `buf dep graph --format json`.
4. Run `buf dep update` when dependency state is stale or intentionally changed.
5. Run `buf build` for compiler diagnostics.
6. Export the pinned dependency with `buf export` and inspect its files rather than searching an OS cache path.

## Generation Failure

1. Inspect `buf.gen*.yaml` execution type, version, revision, output, options, and strategy.
2. Confirm local executables exist and are executable, or confirm BSR connectivity/authentication for remote plugins.
3. Run `buf generate --debug` when normal stderr lacks enough detail.
4. Check for two plugins writing the same file inconsistently.
5. Check generated imports/package paths against `go_package`, managed mode, Python module paths, and TypeScript options.
6. Invoke `$use-buf-plugins` for plugin acquisition, OCI wrappers, offline operation, or rate limits.

## Breaking Changes

Run the check even for intentional pre-release breaks. Distinguish:

- accidental incompatible changes that must be fixed;
- approved experimental/unreleased breaks that require coordinated regeneration and data rebuilding;
- released incompatibilities that require a new API version.

Do not weaken global breaking rules merely to pass one change. Scope an exception only when repository policy explicitly permits it and document why.

## Dependency Hygiene

Use `buf dep prune` only after reviewing imports and generated needs. After any dependency mutation, rerun lint, build, generate, breaking checks, and target-language validation.

Official references:

- https://buf.build/docs/cli/
- https://buf.build/docs/configuration/v2/buf-yaml/
- https://buf.build/docs/configuration/v2/buf-gen-yaml/
- https://buf.build/docs/bsr/
