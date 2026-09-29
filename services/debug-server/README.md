# AIRI Local Debug Server

Query local AIRI traces without opening a devtools page. This service accepts OTLP/HTTP traces and logs and stores them in DuckDB.

## Start and connect

Use Node.js 22 or later and the repository's pnpm version.

```sh
pnpm install
AIRI_DEBUG_TOKEN=local-test-token pnpm --filter @proj-airi/debug-server start
```

The default address is `http://127.0.0.1:6122`. Without an explicit token, the service prints a random token at startup.
Keep that token private. Do not use the example token outside an isolated local test.
The workspace command stores data in `services/debug-server/.airi/debug.duckdb`.
Only this process opens the database. Stop it before opening the file with another DuckDB process.

Start the Web development app with the same token:

```sh
VITE_AIRI_DEBUG_OTLP_ENDPOINT=http://127.0.0.1:6122 \
VITE_AIRI_DEBUG_TOKEN=local-test-token \
pnpm --filter @proj-airi/stage-web dev
```

Normal app activity now exports existing, ended I/O spans. No devtools page needs to be open.
The exporter is disabled in production builds and rejects non-loopback endpoints.
It adds an independent processor without replacing the recording callback or BroadcastChannel.

The default allowed origins are `http://localhost:5173` and `http://127.0.0.1:5173`.
For another development port, set `AIRI_DEBUG_ALLOWED_ORIGINS` to a comma-separated list.
Ingest and query requests require Bearer authentication. The service checks Host and Origin and binds only to loopback.

## Query from a terminal or agent

```sh
export AIRI_DEBUG_TOKEN=local-test-token
curl -H "Authorization: Bearer $AIRI_DEBUG_TOKEN" \
  'http://127.0.0.1:6122/api/debug/v1/sources'
curl -H "Authorization: Bearer $AIRI_DEBUG_TOKEN" \
  'http://127.0.0.1:6122/api/debug/v1/traces?pageSize=20'
curl -H "Authorization: Bearer $AIRI_DEBUG_TOKEN" \
  'http://127.0.0.1:6122/api/debug/v1/events?traceId=YOUR_TRACE_ID&pageSize=20'
```

| Route | Result |
| --- | --- |
| `GET /health` | Public status, without trace contents |
| `GET /api/debug/v1/sources` | Instances and signal counts |
| `GET /api/debug/v1/traces` | Summaries with source, session, time, and state filters |
| `GET /api/debug/v1/traces/:traceId` | One trace summary |
| `GET /api/debug/v1/events` | Span or log records, including resource, scope, schema URLs, and exact timestamps |
| `GET /api/debug/v1/export` | Paginated records and sanitized, re-encoded OTLP batches |

Use `nextCursor` for the next page. An empty value means no further page currently exists.
For tail polling, retain the last event's `cursor` and send it as `afterCursor`.
Never convert cursors or nanosecond timestamps to JavaScript numbers.
Expired cursors return HTTP 410. Restart discovery without a cursor to read the retained window.

Import generated query functions from `@proj-airi/stage-shared/debug`:

```ts
import { debugListEvents } from '@proj-airi/stage-shared/debug'

const result = await debugListEvents({
  baseUrl: 'http://127.0.0.1:6122',
  headers: { Authorization: 'Bearer YOUR_LOCAL_TOKEN' },
  query: { pageSize: 20 },
  throwOnError: true,
})
```

## Protocol and state

Send OTLP/HTTP Protobuf or JSON to `POST /v1/traces` and `POST /v1/logs`. Gzip is supported.
Request limits apply both before and after decompression.
Logs can arrive before their span, without a parent, or without a trace ID.
Unknown event names do not need schema changes.

Transactions commit before acknowledgement. Separate reader and writer connections prevent uncommitted reads.
Span identities use trace ID plus span ID. Logs deduplicate only with both source ID and event ID.
Event ID attributes are `event_id` and `ai.moeru.airi.event_id`.
Conflicting identities return OTLP partial success and leave existing records unchanged.
Logs without stable event IDs retain duplicate deliveries. This is not exactly-once delivery.

- `INCOMPLETE`: no ended root span was observed. It does not prove a span is still running.
- `COMPLETE`: an ended root span was observed. It does not prove every child or data source was captured.
- `ERROR`: an observed span has error status, including a child span.

Mixed-source or mixed-session summaries have an empty corresponding field. Filtered discovery still finds participating sources.

## Privacy and limits

Content capture is off by default. Log bodies, status messages, and content-like attributes are removed before persistence.
For payload inspection, explicitly set `AIRI_DEBUG_CAPTURE_CONTENT=true`.
For browser spans, also set `VITE_AIRI_DEBUG_CAPTURE_CONTENT=true`.
Known credential keys and signed URL query parameters are filtered even with content enabled.
Arbitrary secrets embedded in free text cannot be reliably detected. Use synthetic data when sharing exports.
Exported batches are sanitized evidence, not byte-identical network captures.

| Environment variable | Default |
| --- | --- |
| `AIRI_DEBUG_HOST` | `127.0.0.1` |
| `AIRI_DEBUG_PORT` | `6122` |
| `AIRI_DEBUG_DB_PATH` | `.airi/debug.duckdb`, relative to the service working directory |
| `AIRI_DEBUG_MAX_REQUEST_BYTES` | `1048576` |
| `AIRI_DEBUG_MAX_CONCURRENT_INGESTS` | `8` |
| `AIRI_DEBUG_MAX_STORED_BYTES` | `1073741824` |
| `AIRI_DEBUG_RETENTION_DAYS` | `7` |
| `AIRI_DEBUG_CAPTURE_CONTENT` | `false` |

The ingest limit includes requests reading their bodies. Excess requests return HTTP 503 with Retry-After.
Retention runs at startup and after ingestion. The storage limit counts retained payloads and batch bytes, not DuckDB file allocation.
DuckDB can retain reusable disk blocks after deletion. This limit is not a physical disk quota.
Maintenance failure degrades health and logs an error without retracting a committed acknowledgement.
Shutdown drains HTTP requests for up to five seconds before closing connections and the database.

## Generate and test

The query contract is `packages/stage-shared/proto/airi/debug/v1/debug.proto`.
Buf generates OpenAPI v2, then Hey API generates TypeScript and the Fetch client.
OpenAPI v2 does not encode every oneof constraint. Runtime validation remains necessary.
Do not hand-edit or auto-format generated files.

```sh
buf lint
pnpm --filter @proj-airi/stage-shared debug:generate
pnpm --filter @proj-airi/debug-server typecheck
pnpm --filter @proj-airi/debug-server test
pnpm --filter @proj-airi/stage-ui exec vitest run --project browser src/composables/use-io-tracer.browser.test.ts
```

The integration test launches the CLI, uses standard OTel exporters, and queries through the generated client.
It holds a span open for 30 seconds, queries five correlated logs before span end, checks replay, and restarts the service.
Its local visibility target is p95 below 500 ms across those five samples. This is a smoke test, not a production benchmark.

## Storage choice and boundaries

This service uses `@duckdb/node-api` with parameterized SQL and a local database file.
The existing AIRI Drizzle adapter targets DuckDB WASM. No new ORM driver or protocol workspace is added.

This change does not add agent, tool, ASR, or TTS instrumentation or repair existing span lifecycles.
The long-running-span producer proves receiver behavior, not full business-trace coverage.
Electron pairing, production HTTPS-to-local access, SSE, CLI wrappers, OTLP gRPC, and metrics ingestion are out of scope.
Browser shutdown can lose unsent data. The exporter has a bounded record queue, not a durable browser outbox.
This is not a production replacement for Tempo or Langfuse.
