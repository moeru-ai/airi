# Vendored protocol sources

The OTLP files are copied without changes from [opentelemetry-proto v1.11.1](https://github.com/open-telemetry/opentelemetry-proto/tree/b3f75588eb23c5fca62264edd05d382de49beb1a).
The commit is `b3f75588eb23c5fca62264edd05d382de49beb1a`.
The source files retain their upstream Apache-2.0 license notices.

`google/rpc/status.proto` comes from [googleapis](https://github.com/googleapis/googleapis/blob/ebd1d23ac613b177828dad42ad8dfb13ba498279/google/rpc/status.proto).
It defines OTLP error responses, not a custom AIRI wire type.

These definitions are decoded with protobufjs. The AIRI query contract and Buf generation live in `packages/stage-shared/proto`.
