---
name: use-buf
description: Configure, inspect, update, validate, and troubleshoot Buf workspaces and modules. Use when working with buf.yaml, buf.lock, buf.gen.yaml or domain-specific Buf generation templates; managing BSR dependencies; formatting, linting, generating, detecting breaking Protobuf changes; locating dependency schemas; or diagnosing missing types and generation failures.
---

# Use Buf

Use the Buf CLI as the source of truth for Protobuf compilation, dependency resolution, linting, breaking-change detection, and code generation.

## Inspect Before Changing

1. Read repository instructions.
2. Search the repository root and likely API directories for `buf.yaml`, `buf.lock`, `buf.gen.yaml`, and `buf.gen.<domain>.yaml` files.
3. Inspect the configuration version, module paths, dependency declarations, lint policy, breaking policy, inputs, plugin pins, output paths, and existing generation scripts.
4. Run `buf --version` and check repository/CI tool pins before using features from a newer configuration schema.
5. Diagnose configuration or dependency problems before changing `.proto` files to work around them.

Use one default `buf.gen.yaml`. Introduce `buf.gen.<domain>.yaml` only when generation products genuinely require isolated plugin sets, inputs, or outputs. Pass non-default templates explicitly with `buf generate --template <file>`.

## Keep Configuration Responsibilities Clear

- Use `buf.yaml` for workspaces/modules, BSR dependencies, lint rules, breaking rules, policies, and Buf check plugins.
- Use `buf.gen.yaml` or `buf.gen.<domain>.yaml` for `protoc-gen-*` code-generation plugins, inputs, output directories, options, and managed mode.
- Use `buf.lock` as generated dependency resolution state. Do not edit it manually.
- Keep configuration in the repository root or the established API workspace directory unless repository structure requires otherwise.

Read [references/configuration.md](references/configuration.md) before adding modules, dependencies, check plugins, generation templates, or output paths.

## Manage Dependencies Deliberately

- Prefer BSR modules for maintained dependencies, including Google APIs, well-known types, Protovalidate, and grpc-gateway annotations.
- Add or remove dependencies in `buf.yaml`, then run `buf dep update` and inspect the `buf.lock` diff.
- Use `buf dep graph --format json` to identify the resolved dependency chain.
- Use `buf dep prune` only after confirming an import is genuinely unused.
- When a type appears missing, inspect configuration and the lockfile, run `buf dep update`, then run `buf build` or `buf generate` to obtain the compiler's concrete import/type error.
- Never hardcode an operating system's Buf cache location. Export the pinned module with `buf export` when source inspection is required.

## Required Validation

After changing first-party Protobuf or Buf configuration, MUST run:

```sh
buf lint
buf generate
buf breaking --against '.git#branch=main'
```

Also run `buf format --diff` or the repository's format check and all language-specific tests/type checks for generated outputs.

Do not skip the breaking check merely because a break is intentional. Run it, capture the violations, and report that the change is an approved experimental/unreleased break. If the repository does not have a `main` branch, report that exact baseline failure and resolve the intended integration baseline rather than silently omitting compatibility validation.

## Diagnose in Dependency Order

1. Confirm the current directory and discovered `buf.yaml`.
2. Confirm module paths and import paths.
3. Confirm dependencies and `buf.lock` with `buf dep graph`.
4. Compile with `buf build`.
5. Lint with `buf lint`.
6. Generate with the selected template.
7. Inspect plugin stderr, output collisions, and generated diffs.
8. Run the breaking check against main.

Use `$use-buf-plugins` for remote/local plugin selection, offline generation, rate limits, or plugin wrappers. Read [references/commands-and-troubleshooting.md](references/commands-and-troubleshooting.md) for precise inspection commands and failure handling.
