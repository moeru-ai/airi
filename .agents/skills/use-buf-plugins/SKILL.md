---
name: use-buf-plugins
description: Select, pin, configure, install, build, and troubleshoot Buf code-generation plugins across remote BSR and local execution. Use for buf.gen.yaml plugin entries, protoc-gen-* tools, generated Go/Python/TypeScript/OpenAPI outputs, offline generation, BSR connectivity or rate-limit failures, OCI-packaged plugin wrappers, or reproducing plugins from bufbuild/plugins.
---

# Use Buf Plugins

Make code generation reproducible across languages and environments. Prefer an established generator, pin its version, preserve source-relative package structure, and verify generated output.

## Inspect the Existing Generation Contract

1. Read repository instructions, every applicable `buf.gen*.yaml`, generation script, CI workflow, package manifest, and generated directory convention.
2. Identify each required artifact: message runtime, gRPC client/server, gateway, OpenAPI, language typing, or framework bindings.
3. Record plugin source, version/revision, options, invocation strategy, input scope, output path, and runtime requirements.
4. Do not replace a working generator or rearrange generated paths without an explicit requirement.

## Choose Remote or Local Deliberately

Use a BSR remote plugin when network access is reliable and centralized execution is acceptable. Pin the upstream plugin version and revision when available; do not rely on `latest` for reproducible generation.

Use a local plugin when:

- generation must work offline or in an isolated network;
- the BSR is unavailable;
- authentication or codegen rate limits make remote generation unreliable;
- a private/custom plugin cannot run remotely;
- CI requires locally controlled binaries or images.

Remote generation sends the Protobuf input to the configured BSR executor. Confirm that this is acceptable for private schemas. Authenticate with the repository's approved mechanism when increased BSR limits are needed; never embed tokens in config.

Read [references/remote-and-local.md](references/remote-and-local.md) before changing plugin execution mode.

## Source and Package Local Plugins Reproducibly

- Prefer the plugin author's official binary/package or the upstream definitions in `bufbuild/plugins`.
- Treat each upstream plugin Dockerfile, version, and revision as immutable build input.
- A maintained mirror may build selected upstream `bufbuild/plugins` Dockerfiles into OCI images. Verify its source mapping, image entrypoint, version tag, platforms, provenance, and update cadence before depending on it.
- If using a maintained `buf-build` mirror, understand the convention: an upstream path like `plugins/<family>/<plugin>/<version>/Dockerfile` is published as an image whose repository identifies `<family>-<plugin>` and whose tag identifies `<version>`. Reinspect the mirror documentation instead of hardcoding one publisher, version, or registry.
- If the maintained image is acceptable, consume a pinned digest or immutable version. Otherwise build the upstream definition locally.
- Invoke `$use-docker-buildx-for-building` before building or smoke-testing any plugin OCI image. Follow its platform, `--load`, naming, secret, runtime, and cleanup requirements.

OCI images are not automatically Buf local plugins. Buf expects an executable that reads a `CodeGeneratorRequest` from stdin and writes a `CodeGeneratorResponse` to stdout. Provide a narrow executable wrapper only after inspecting the image entrypoint; preserve stdin/stdout, forward arguments, use `--rm`, and never allocate a TTY.

## Configure Outputs by Ecosystem

- Generate both runtime and service bindings required by the application.
- For Go, follow the official Go generated-code and gRPC plugin guidance and honor `go_package`/managed-mode decisions.
- For Python, generate runtime modules, gRPC bindings, and `.pyi` typing where the toolchain supports them.
- For TypeScript, generate the ecosystem's customary `.ts` or declaration artifacts.
- For OpenAPI, use the repository's established grpc-gateway/OpenAPI generator and annotations. Do not hand-maintain a second schema generator.
- Keep output paths aligned with Protobuf source/package paths unless an explicit `buf.gen.yaml` convention says otherwise.
- Pin generated-code runtime dependencies in each language package manager as well as pinning generators; generator reproducibility does not guarantee runtime compatibility.

Read [references/language-generators.md](references/language-generators.md) before adding or replacing a language generator.

## Validate Plugin Changes

1. Run the plugin binary or OCI wrapper with a bounded smoke check appropriate to its entrypoint.
2. Run `buf lint`.
3. Run `buf generate` with every affected template.
4. Run `buf breaking --against '.git#branch=main'`.
5. Inspect the generated diff for missing files, unexpected path changes, nondeterminism, and stale artifacts.
6. Run target-language formatting, compilation, tests, and type checks.
7. Repeat generation from a clean state when reproducibility is uncertain; generated output should be stable.
8. For an air-gapped contract, repeat the complete generation with networking disabled and no hidden image pull or ambient PATH dependency.

Never pass registry credentials, source credentials, or private dependency tokens through Docker build arguments, image layers, generated files, or committed plugin wrappers.
