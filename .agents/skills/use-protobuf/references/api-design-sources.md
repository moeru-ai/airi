# API and Protobuf Design Sources

Use these as selected references, not as mutually mandatory specifications. Preserve the repository's established API style unless the user requests a migration.

- [Protocol Buffers style guide](https://protobuf.dev/programming-guides/style/): file layout, identifier casing, enum zero values, services, and naming hazards.
- [Proto3 language guide](https://protobuf.dev/programming-guides/proto3/): field numbers, presence, `oneof`, imports, `Any`, JSON mapping, and compatible evolution.
- [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/): unary, client-streaming, server-streaming, bidirectional-streaming, cancellation, deadlines, and metadata.
- [JSON:API error objects](https://jsonapi.org/format/#errors): structured HTTP error identity, status, code, title, detail, source, links, and metadata.
- [Microsoft REST API Guidelines](https://github.com/microsoft/api-guidelines): public REST consistency, resources, methods, errors, versioning, pagination, and long-running operations.
- [Kratos Protobuf guideline](https://go-kratos.dev/docs/guide/api-protobuf/): API directory/version organization, HTTP annotations, and generated service conventions.
- [Boston Dynamics API Protobuf guidelines](https://dev.bostondynamics.com/docs/protos/style_guide.html): production schema conventions, services, errors, timestamps, units, and compatibility.
- [VictoriaMetrics Practical Protobuf](https://victoriametrics.com/blog/go-protobuf-basic/): practical Go/Protobuf encoding and generated-code considerations; cross-check advice against official Protobuf compatibility rules.
- [Go generated code guide](https://protobuf.dev/reference/go/go-generated/): `go_package`, generated package mapping, and Go API generation.
- [Python generated code guide](https://protobuf.dev/reference/python/python-generated/): Python module generation and runtime behavior.

When sources disagree, prioritize wire compatibility, explicit repository policy, official Protobuf/gRPC behavior, and the user's stated API lifecycle.
