---
name: use-protobuf
description: Design, change, and review Protobuf schemas used as gRPC contracts, streaming protocols, typed data models, grpc-gateway REST APIs, OpenAPI specifications, or generated SDK inputs. Use for .proto files, RPC request/response design, oneof stream events, validation annotations, API versioning, schema evolution, generated package layout, and avoiding weak Struct or Any payloads.
---

# Use Protobuf

Treat Protobuf as the canonical typed contract for gRPC, REST gateway bindings, OpenAPI, generated SDKs, and shared data structures. Model the domain before optimizing generated code.

## AIRI Local Debug Service

Use `.proto` → Buf OpenAPI generation → Hey API for the local debug HTTP contract.
Generate TypeScript types and the Fetch client from OpenAPI.
Keep contracts and generated outputs in the existing `stage-shared` package.
Keep collection and upload logic in `stage-ui`.
Add only `services/debug-server`. Do not add separate protocol or SDK workspace packages.
Keep HTTP JSON shapes consistent with the generated client.
Check `oneof`, field presence, int64, bytes, enums, and errors across both generation steps.
Do not assume OpenAPI generation also generates Hono handlers or runtime validation.
Use Eventa for Electron IPC and cross-thread forwarding.

Imported with the Buf skills from [kbv-extractor-memes](https://github.com/proj-airi/kbv-extractor-memes/tree/73329d340faf18834990b64b2d17d222e43bb8ea/.agents/skills).
The AIRI-specific section records the local debug service decisions.

## Workflow

1. Read repository instructions and inspect existing `.proto` files, packages, versions, imports, generation configuration, and generated output conventions.
2. Classify each service as gRPC-only or HTTP-exposed before adding annotations.
3. Model every RPC, stream packet, enum, error, and reusable message with concrete types.
4. Apply transport-specific validation and documentation rules.
5. Evaluate compatibility according to the package's release state and version.
6. Generate every configured SDK and OpenAPI artifact. Use `$use-buf` and `$use-buf-plugins` when available.
7. Run repository tests and inspect generated diffs; never hand-edit generated code.

## Define RPC Contracts Explicitly

- Define a dedicated RPC method for every gRPC operation.
- Name unary messages `MethodRequest` and `MethodResponse`.
- Keep request and response messages distinct even when their current fields happen to match.
- Use TitleCase service, method, message, and enum names; use `lower_snake_case` fields and `UPPER_SNAKE_CASE` enum values.
- Prefer comments that explain semantics, units, identity, presence, ordering, and lifecycle rather than restating the field name.

```proto
rpc GetDocument(GetDocumentRequest) returns (GetDocumentResponse);
```

## Model Streaming Without Base Payloads

Use the appropriate gRPC streaming form:

```proto
rpc ImportRecords(stream ImportRecordsStreamRequest) returns (ImportRecordsResponse);
rpc WatchJob(WatchJobRequest) returns (stream WatchJobStreamResponse);
rpc Transfer(stream TransferStreamRequest) returns (stream TransferStreamResponse);
```

MUST NOT create an abstract, generic, inherited, or catch-all base event/base payload for stream requests or responses. Define concrete stream event, step, or packet messages. When several variants may occur, use `oneof` whose alternatives are separate messages. Use one homogeneous stream message only when every packet genuinely has the same body and semantics, such as fixed-shape file chunks.

Read [references/schema-design.md](references/schema-design.md) before designing or changing any streaming RPC.

## Separate gRPC-Only and HTTP-Exposed Schemas

For gRPC-only services, do not add `google.api.http`, grpc-gateway, or `grpc.gateway.protoc_gen_openapiv2` imports, method options, message options, enum options, or field options.

For every `*Request` exposed through grpc-gateway, regardless of GET, POST, body, path, or query placement:

- validate accepted input with `buf.validate` annotations;
- document every request field with appropriate `openapiv2` information such as example, description, format, range, length, pattern, or collection bounds;
- keep runtime validation authoritative and make OpenAPI constraints agree with it;
- define the `google.api.http` binding and operation documentation intentionally.

Do not hardcode a Buf cache path when researching extension fields. Follow the export/query workflow in [references/http-and-openapi.md](references/http-and-openapi.md).

## Prefer Strong Domain Types

- Use an enum whenever the value belongs to a finite controlled vocabulary; do not disguise it as an unconstrained string.
- Give enums an explicit zero value and document what the enum classifies.
- Prefer dedicated messages, well-known types, repeated fields, maps, and `oneof` over `google.protobuf.Struct` or `google.protobuf.Any`.
- Use `Struct` or `Any` only for a real open-world boundary. Document why typed modeling is impossible and how consumers validate the payload.
- In Go, use `protojson` for Protobuf JSON and a registered type resolver for `Any`; do not route Protobuf through generic `encoding/json`. Research the canonical library for every other target language before implementing serialization.

## Organize and Version Schemas

- Set `go_package` on first-party schemas that generate Go.
- Keep language-neutral source paths and verify Python output with `protoc-gen-python` plus `protoc-gen-pyi`. Do not assume a kebab-case Protobuf source/import path automatically makes Python output invalid, and do not rename the source tree merely out of fear that it might violate Python module conventions; generate and verify the selected plugins' actual module/import behavior.
- Put API versions in both package and directory identity, using forms such as `v1`, `v2`, `v1alpha1`, or `v1beta1`.
- Before release, while a feature is explicitly experimental or feature-flagged, allow deliberate breaking redesigns and field renumbering only when every producer, consumer, stored payload, and generated artifact can be rebuilt together.
- After release, never renumber or reuse field numbers. Reserve removed field numbers and names, and introduce a new version for incompatible redesigns.
- Keep generated Go packages, Python modules, TypeScript modules, and other SDK paths aligned with the source schema path. Preserve each language plugin's conventional leaf layout.
- Change output directories or flattening only when the user explicitly requests it or the repository already declares that convention in generation configuration.

## Generate Complete SDK Surfaces

- Generate runtime code and the language's customary typing artifacts.
- For Python, generate `.py` plus `.pyi` when supported.
- For TypeScript, generate `.ts` or the ecosystem-appropriate `.d.ts`/`.d.mts` artifacts.
- Prefer the established generator for each language and OpenAPI ecosystem. Do not write a parallel custom generator or manually maintain generated output.

Read [references/schema-design.md](references/schema-design.md) for complete modeling and evolution rules, [references/http-and-openapi.md](references/http-and-openapi.md) for gateway schemas, and [references/api-design-sources.md](references/api-design-sources.md) when designing public resources, errors, pagination, or long-running operations.
