# Language Generator Selection

Select established plugins from the target ecosystem and verify their current official documentation before adding them.

## Go

Usually generate both Protobuf messages and gRPC bindings when the application uses gRPC. Align `go_package`, managed mode, `paths=source_relative`/module options, and repository import paths.

- https://grpc.io/docs/languages/go/quickstart/
- https://protobuf.dev/reference/go/go-generated/

## Python

Generate runtime messages and gRPC bindings. Also generate `.pyi` typing with the established Python typing plugin when supported by the repository. Verify namespace/package behavior instead of changing source schema paths preemptively.

- https://protobuf.dev/reference/python/python-generated/
- https://grpc.io/docs/languages/python/quickstart/

## TypeScript and JavaScript

Choose the runtime already used by the project, such as the official/Buf-maintained Protobuf ecosystem or the framework required by the application. Generate `.ts` or appropriate `.d.ts`/`.d.mts` declarations. Do not mix incompatible message runtimes in one SDK without an explicit migration plan.

- https://protobuf.dev/reference/
- https://buf.build/docs/bsr/remote-plugins/

## OpenAPI and grpc-gateway

Use the established grpc-gateway and OpenAPI plugin versions together. Generate gateway bindings only for RPCs intentionally exposed through HTTP. Generate OpenAPI documentation from annotations/comments rather than maintaining a parallel hand-written schema.

- https://grpc-ecosystem.github.io/grpc-gateway/docs/mapping/customizing_openapi_output/

## Selection Checklist

- Confirm maintenance status and compatibility with the Protobuf runtime/compiler.
- Pin plugin version and BSR revision or local package/image digest.
- Confirm required companion plugins, such as message runtime plus gRPC service bindings.
- Preserve output/package paths expected by consumers.
- Generate typing artifacts customary for the language.
- Compile, format, type-check, and test generated code.
- Avoid writing a custom generator when a maintained ecosystem plugin already implements the contract.
