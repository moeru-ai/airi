# Remote and Local Buf Plugins

## Remote Plugins

Remote BSR plugins reduce local tool installation but require network access and send schema input to the remote executor.

```yaml
version: v2
plugins:
  - remote: buf.build/protocolbuffers/go:<version>
    revision: <revision>
    out: gen/go
    opt:
      - paths=source_relative
```

Pin versions and revisions where available. Authenticate with `buf registry login` through approved credential handling when appropriate. BSR code generation is rate-limited; inspect current limits and `Retry-After` instead of embedding numeric limits in automation:

- https://buf.build/docs/bsr/rate-limits/
- https://buf.build/docs/bsr/remote-plugins/

Do not retry HTTP 429 responses in a tight loop. Honor server guidance, reduce redundant generation, authenticate, or switch to an approved local toolchain.

## Local Plugins

Buf accepts a PATH executable, relative/absolute path, or command array:

```yaml
plugins:
  - local: protoc-gen-go
    out: gen/go
  - local: tools/protoc-gen-custom
    out: gen/custom
  - local: ["go", "run", "example.org/tool/cmd/protoc-gen-example@v1.2.3"]
    out: gen/example
```

Pin package versions and avoid mutable ambient installations in CI. Local plugins implement the standard protoc plugin protocol: read `CodeGeneratorRequest` from stdin and write `CodeGeneratorResponse` to stdout.

## OCI-Packaged Plugins

An OCI image needs an entrypoint that implements the protoc plugin protocol. Buf cannot use an image reference directly as `local`; provide an executable wrapper after inspecting the image:

```sh
#!/bin/sh
set -eu

exec docker run --rm -i <plugin-image>@sha256:<digest> "$@"
```

Do not use `-t`; the protobuf request/response use stdin/stdout. Keep logs on stderr. Pin an immutable digest or version and ensure the runtime platform is supported.
For a preloaded air-gapped image, add `--pull=never`; add `--network=none`, read-only/no-new-privileges, capability drops, or bounded temporary storage when the inspected plugin remains compatible with those restrictions.

Before accepting a wrapper:

1. inspect the image entrypoint and command;
2. verify its upstream plugin name/version/revision;
3. smoke-test the exact platform and image;
4. run generation twice and confirm stable output;
5. ensure wrapper/image credentials are not committed.

For transfer into an air-gapped environment, export the exact platform image/archive, record its digest and checksum, preload it without a registry pull, and transfer the pinned Buf binary, dependency state, generation template, wrappers, and language runtime locks through the approved channel.

## Building from `bufbuild/plugins`

The upstream repository stores versioned plugin definitions under `plugins/<family>/<plugin>/<version>/`. Inspect the selected Dockerfile and metadata rather than inventing a build. A mirror may automate building these definitions into multi-platform OCI images; verify that tag-to-upstream-path mapping from its current documentation.

If no acceptable maintained image exists:

1. select the exact upstream plugin definition and version;
2. inspect its Dockerfile, sources, checksums, base images, entrypoint, and supported platforms;
3. invoke `$use-docker-buildx-for-building` and follow its repository-derived context, explicit platform, `--load`, runtime smoke test, and secret rules;
4. publish only when the user authorizes registry mutation;
5. pin the consumed image by digest/version.

Useful sources:

- https://github.com/bufbuild/plugins/tree/main/plugins
- https://buf.build/docs/bsr/remote-plugins/custom-plugins/
- https://github.com/nekomeowww/buf-build
