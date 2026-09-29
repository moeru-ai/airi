# Protobuf Schema Design

## Contents

- RPC and message boundaries
- Streaming protocols
- Strong typing and presence
- Reuse without abstraction leakage
- Evolution and versioning
- Source and generated layout

## RPC and Message Boundaries

Give each operation its own request and response, named after the method:

```proto
service CatalogService {
  rpc CreateItem(CreateItemRequest) returns (CreateItemResponse);
  rpc GetItem(GetItemRequest) returns (GetItemResponse);
}
```

Do not use a generic `Request`, `Response`, `Payload`, or `Envelope` across unrelated methods. Dedicated messages allow validation, documentation, authorization, and evolution to diverge safely.

Model method inputs in the request even when the transport could carry them elsewhere. Model method results in the response instead of returning a domain entity directly; the response leaves room for metadata and future compatible fields.

## Streaming Protocols

Choose the cardinality from behavior:

- client streaming: large or incremental input such as JSON records, file chunks, or query batches;
- server streaming: progress, events, task steps, query results, or binary output;
- bidirectional streaming: interactive/duplex protocols where both sides advance independently.

MUST NOT define abstract or generic base stream events or payloads. For heterogeneous streams, use separate messages under `oneof`:

```proto
message WatchImportStreamResponse {
  oneof event {
    ImportStarted started = 1;
    ImportProgress progress = 2;
    ImportWarning warning = 3;
    ImportCompleted completed = 4;
  }
}

message ImportStarted {
  string import_id = 1;
}

message ImportProgress {
  int64 records_processed = 1;
  optional int64 records_total = 2;
}
```

Use the same structure for heterogeneous client streams. For example, define separate header, JSON record, file chunk, commit, and abort messages rather than a base packet with many nullable fields.

Use one homogeneous stream message only when every packet has exactly the same semantics. A fixed-shape file chunk can be:

```proto
message DownloadFileStreamResponse {
  bytes data = 1;
}
```

If the stream also carries headers, checksums, progress, or trailers, return to `oneof` with concrete variants.

Document ordering, which event may appear first/last, repetition, completion, cancellation, resumability, offsets, checksums, and whether an error arrives as gRPC status or an in-band event.

## Strong Typing and Presence

- Use enums for finite controlled vocabularies. Prefix top-level enum values with the enum name and give the zero value `_UNSPECIFIED` or `_UNKNOWN` semantics.
- Use `optional` when presence differs from the scalar default. Do not add presence when unset and default are semantically identical.
- Use `google.protobuf.Timestamp`, `Duration`, `FieldMask`, or other appropriate well-known types instead of strings with implicit formats.
- Include units in names or comments for numeric quantities, such as `timeout_seconds` or `size_bytes`.
- Use `bytes` for opaque binary content, not base64 text fields.
- Use maps only for truly dynamic keyed collections. Prefer repeated typed entries when keys or values need validation, ordering, metadata, or future evolution.
- Avoid `Struct` and `Any`. If an upstream opaque payload must be preserved, isolate it at that boundary, document its schema/version and validation, and provide typed projections for first-class fields.

For Go JSON conversion, use `google.golang.org/protobuf/encoding/protojson`. For `Any`, configure a resolver/type registry. Research and use the canonical Protobuf JSON/runtime API in every other language.

## Reuse Without Abstraction Leakage

Reuse a message when two fields mean the same contract and must evolve together. Import the canonical message instead of duplicating its fields and writing conversion code. Keep package dependency direction intentional and acyclic.

Do not reuse merely because two messages currently have the same shape. Separate them when their ownership, validation, authorization, lifecycle, or future evolution differs. Never introduce a generic base request/response/event solely to reduce line count.

## Evolution and Versioning

Before a feature is released, while explicitly experimental or feature-flagged, a coordinated breaking redesign may change structure or field numbers. Rebuild all generated SDKs, services, clients, fixtures, queues, and stored payloads together, and still run breaking-change detection so the break is visible.

After release:

- never change or reuse a field number;
- reserve deleted numbers and names;
- add fields compatibly whenever possible;
- avoid moving fields into or out of an existing `oneof` without studying wire behavior;
- introduce `v2` for incompatible changes;
- use `v1alpha1`/`v1beta1` to signal unstable contracts when appropriate.

Put the version in both directory and package identity, for example `example/catalog/v1` and `example.catalog.v1`. Keep imports explicit and avoid confusing relative resolution across packages.

## Source and Generated Layout

- Name source files `lower_snake_case.proto`.
- Sort imports and set language file options such as `go_package` where required by the project's generation model.
- Keep source directories language-neutral.
- Preserve the schema's path in generated Go, Python, TypeScript, and other targets unless the language plugin's established convention adds a conventional leaf directory.
- Verify Python with runtime and typing plugins instead of reorganizing the schema tree preemptively.
- Never edit generated files by hand.
