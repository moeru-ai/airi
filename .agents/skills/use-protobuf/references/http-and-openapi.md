# grpc-gateway, Validation, and OpenAPI

## Classify the Transport

For gRPC-only services, omit all of the following:

- `google/api/annotations.proto` and `google.api.http`;
- `protoc-gen-openapiv2/options/annotations.proto`;
- grpc-gateway/OpenAPI service, operation, message, enum, and field options.

Keep ordinary Protobuf comments and runtime validation when required by the gRPC service itself, but do not make a gRPC-only contract depend on an HTTP documentation toolchain.

For an HTTP-exposed RPC, define the binding and document the operation:

```proto
rpc CreateWidget(CreateWidgetRequest) returns (CreateWidgetResponse) {
  option (google.api.http) = {
    post: "/v1/widgets"
    body: "*"
  };
  option (grpc.gateway.protoc_gen_openapiv2.options.openapiv2_operation) = {
    operation_id: "widgets_create"
    summary: "Create a widget."
    tags: "Widgets"
  };
}
```

## Validate Every HTTP Request

Apply Protovalidate to every accepted request field regardless of whether it comes from a path, query string, GET request, POST body, or other HTTP method. Validate strings, numbers, enums, collections, nested messages, cross-field constraints, and identifiers according to domain semantics.

```proto
message ListWidgetsRequest {
  string parent = 1 [
    (buf.validate.field).string = {
      min_len: 1
      max_len: 200
    },
    (grpc.gateway.protoc_gen_openapiv2.options.openapiv2_field) = {
      description: "Parent collection identifier."
      example: "\"accounts/42\""
    }
  ];
  int32 page_size = 2 [
    (buf.validate.field).int32 = {
      gte: 0
      lte: 100
    },
    (grpc.gateway.protoc_gen_openapiv2.options.openapiv2_field) = {
      description: "Maximum number of widgets to return."
      example: "50"
      minimum: 0
      maximum: 100
    }
  ];
}
```

Treat validation as the executable acceptance rule. Mirror relevant range, pattern, length, format, example, description, and collection information into OpenAPI so generated clients and documentation do not contradict runtime behavior.

## Inspect Extension Definitions Without Cache Paths

Do not hardcode `~/.cache`, platform-specific cache roots, module digests, or commit directories. Inspect the dependency declared in `buf.yaml` and pinned in `buf.lock`, then use Buf:

```sh
buf dep graph --format json

inspection_dir="$(mktemp -d)"
buf export buf.build/grpc-ecosystem/grpc-gateway:<pinned-ref> \
  --path protoc-gen-openapiv2/options/annotations.proto \
  --path protoc-gen-openapiv2/options/openapiv2.proto \
  --output "$inspection_dir"

rg -n "message JSONSchema|openapiv2_field|example|description" "$inspection_dir"
```

Resolve `<pinned-ref>` from repository configuration/lock state. Remove the temporary directory after inspection. Consult `$use-buf` for dependency resolution and `$use-buf-plugins` for generator behavior.

The grpc-gateway OpenAPI documentation explains comment propagation, operation/schema/field options, visibility, merge behavior, enum rendering, and output configuration:

- https://grpc-ecosystem.github.io/grpc-gateway/docs/mapping/customizing_openapi_output/

## Public HTTP API Shape

Use a consistent resource and error model. When the application adopts JSON:API errors, model typed equivalents of useful members such as status, code, title, detail, source pointer/parameter/header, links, and meta rather than returning an unstructured object. Do not combine mutually incompatible envelope conventions without an explicit API-wide decision.

Use the Microsoft API Guidelines and JSON:API as design references for resource naming, HTTP semantics, pagination, idempotency, errors, and long-running operations. Adapt them to the existing API contract rather than importing conventions piecemeal.
