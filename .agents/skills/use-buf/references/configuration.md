# Buf Configuration

## Discover the Workspace

Search before editing:

```sh
rg --files -g 'buf.yaml' -g 'buf.lock' -g 'buf.gen*.yaml'
buf --version
```

Inspect root-level and API-directory configurations, generation scripts, CI, and tool pins. Determine whether the repository uses one workspace or several independent modules.

## `buf.yaml`

Use `buf.yaml` to declare:

- configuration version;
- module source paths and optional BSR module names;
- BSR schema dependencies;
- lint rules/exceptions;
- breaking-change rules/exceptions;
- policies and Buf check plugins where supported.

`buf.yaml` check plugins extend lint/breaking behavior. They are not `protoc-gen-*` code generators.

Prefer maintained BSR dependencies. Common examples include:

```yaml
deps:
  - buf.build/googleapis/googleapis
  - buf.build/protocolbuffers/wellknowntypes
  - buf.build/bufbuild/protovalidate
  - buf.build/grpc-ecosystem/grpc-gateway
```

Use only dependencies actually imported by the workspace.

## `buf.gen.yaml`

Use `buf.gen.yaml` for code generation:

```yaml
version: v2
inputs:
  - directory: proto
plugins:
  - remote: buf.build/protocolbuffers/go:<version>
    revision: <revision>
    out: gen/go
    opt:
      - paths=source_relative
```

Each plugin selects exactly one execution type: `remote`, `local`, or `protoc_builtin`. Configure `out`, `opt`, `strategy`, input/type filters, and import inclusion according to the plugin contract.

Use the default filename for the ordinary complete generation pipeline. Create `buf.gen.<domain>.yaml` only when one repository intentionally separates outputs such as server SDKs, web SDKs, documentation, or offline generation. Invoke it explicitly:

```sh
buf generate --template buf.gen.web.yaml
```

Do not create many templates merely to avoid understanding one configuration.

## Dependencies and Lock State

After changing `deps`:

```sh
buf dep update
buf dep graph --format json
git diff -- buf.yaml buf.lock
```

Never hand-edit `buf.lock`. Treat unexpected commit/digest movement as a dependency change that requires review.

To inspect a dependency schema without relying on cache internals:

```sh
export_dir="$(mktemp -d)"
buf export buf.build/<owner>/<module>:<pinned-ref> \
  --path path/inside/module.proto \
  --output "$export_dir"
```

Clean up `export_dir` after inspection.

## Generated Output Paths

Keep generated paths aligned with Protobuf import/package paths and language conventions. Use `paths=source_relative`, managed mode, or language-specific module options only after inspecting existing consumers. Do not flatten or relocate output without updating imports, packaging, CI, and downstream clients intentionally.
