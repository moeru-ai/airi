# `@proj-airi/api-server`

Project AIRI's resource API. Authentication is a separate workspace app at
`server/apps/auth`; this package does not instantiate Better Auth or expose
auth/OIDC routes.

## Responsibilities

- Hono business APIs and WebSocket endpoints.
- Characters, chats, providers, Flux, Stripe, model routing, and billing.
- PostgreSQL migration ownership for the currently shared database. Drizzle reads the checked-in `drizzle/` journal and SQL files at startup.
- Redis cache, configuration KV, and cross-instance Pub/Sub.
- Local verification of Auth-issued OIDC JWTs through public JWKS.

## Redis cache

`src/libs/redis/cache.ts` provides stateless functions for string snapshots.
`writeCache` requires a positive TTL and writes the value and expiry atomically.
`readCache` accepts only expiring entries and never renews their expiry.
Redis errors propagate to the caller. These functions do not manage locks,
queues, Pub/Sub, connections, or database transactions.

`src/services/domain/flux-cache.ts` owns balance validation and the 60-second
Flux TTL. Flux services use its read, write, and invalidation functions.
ConfigKV shares the write function while retaining its existing read policy.
Keys use domain names: `config:{key}`, `stripe:prices`, and `user:{userId}:flux`.
The cache functions do not add a key prefix.

## Object storage

The API provides an optional S3 adapter for private objects. It supports server
uploads, streamed downloads, HEAD, deletion, and presigned PUT/GET URLs.
Use it for domain-owned files such as attachments and audio. It does not provide
public upload routes, access control, attachment records, or message sync.

Set `S3_BUCKET` and `S3_REGION` to enable it. Leave all `S3_*` variables unset to
disable it. Partial configuration fails startup.

| Variable | Purpose | Default |
| --- | --- | --- |
| `S3_BUCKET` | Existing private bucket | Unset |
| `S3_REGION` | AWS region, or the region required by the compatible service | Unset |
| `S3_ENDPOINT` | Custom HTTP(S) endpoint for R2, MinIO, Railway, or another S3 service | AWS endpoint |
| `S3_FORCE_PATH_STYLE` | `true` for endpoint/bucket/key addressing, `false` for virtual-hosted addressing | `false` |

For static credentials, set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`.
For temporary credentials, also set `AWS_SESSION_TOKEN`. For IAM roles, omit these
variables. The SDK resolves credentials through its
[default credential chain](https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/setting-credentials-node.html).
Signed URLs have a fixed 15-minute lifetime. Temporary credentials can expire sooner.
Leave `S3_FORCE_PATH_STYLE` unset unless the service requires path-style addressing, such as a local MinIO server.
Use HTTPS for remote endpoints. HTTP supports local S3 development servers.
The adapter does not create buckets or change bucket policies.

`app.ts` registers `datastore:objectStore` through Injeca and destroys its client
on shutdown. Add this provider to a domain's `dependsOn` when it needs storage.
An unconfigured provider resolves to `undefined`. The domain must decide whether
storage is required for its operation.

Domain services own object keys, authorization, size limits, and overwrite rules.
The adapter preserves keys exactly. `putObject` accepts AWS `Key`, `Body`,
`ContentType`, and `Metadata` fields. `getObject` returns the SDK response.
Consume or destroy its `Body` stream to release the connection.
HEAD, GET, PUT, and DELETE errors propagate to the caller.

`createUploadTarget` returns a temporary URL and required headers. Send those
headers unchanged with PUT. Content type and metadata are signed according to
the [AWS presigner contract](https://github.com/aws/aws-sdk-js-v3/blob/main/packages/s3-request-presigner/README.md).
The signature does not prove uploaded bytes match application metadata.
The domain must validate the uploaded object before it marks a file complete.
`createDownloadUrl` signs access without checking object existence.
Authorize access before either signing operation. Do not persist or log signed URLs.
For browser uploads, configure bucket CORS for the exact client origins, required
methods, and returned upload headers. CORS configuration remains deployment-owned.

See [the storage ADR](../../docs/ai/adr/2026-09-27-s3-object-storage.md).

To run the optional integration test, point `TEST_S3_ENDPOINT` at a disposable
S3-compatible server. Set `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`
to its test credentials. The test creates and deletes a unique bucket.

```sh
pnpm -F @proj-airi/api-server exec vitest run src/services/adapters/object-store.integration.test.ts
```

## Payment

`src/services/domain/payment` owns pack grant and `payment_order` rows.
CORE exposes `openPending`, `bindProcessorOrder`, `abandon`, `settle`,
and `deleteAllForUser`. CORE never sees a raw processor event. An adapter
maps the processor result onto a `ClaimReceipt` or `EvidenceReceipt`,
then calls `settle`.
Checkout and package list live in the Stripe adapter on `/api/v1/stripe/*`.
ConfigKV stores `STRIPE_FLUX_PRODUCT_ID`. The adapter lists that product's
Prices from Stripe. `GET /packages` returns `stripePriceId`. Checkout accepts
`stripePriceId`. Label, flux amount, and display prices come from Price
metadata and Stripe amounts.
Apple IAP lives on `/api/v1/apple-iap/*`. The channel verifies StoreKit 2
JWS proof from every app in `APPLE_IAP_APPS`, resolves the pack from
`productId` through `APPLE_FLUX_PACKS`, then settles an
`EvidenceReceipt`.

## Run locally

```sh
pnpm -F @proj-airi/api-server dev
pnpm -F @proj-airi/api-server typecheck
pnpm -F @proj-airi/api-server exec vitest run
pnpm -F @proj-airi/api-server build
```

Run the complete local backend from the repository root:

```sh
pnpm dev:backend
```

For source-level debugging, start `@proj-airi/api-server` and
`@proj-airi/auth-server` separately instead.

`server/docker-compose.yaml` exposes the local Caddy gateway at `http://localhost:6112` and keeps
the API and Auth container ports private.

## Service boundaries

- `AUTH_SERVER_URL` is Auth's canonical public issuer origin used for JWKS,
  issuer, and audience validation. It must exactly equal Auth's `PUBLIC_URL`.
- `/internal/auth/*` is reachable only on the deployment's trusted private
  network. The public edge must reject `/internal/*` and the API service must
  not have its own public ingress.
- `AUTH_SERVER_INTERNAL_URL` optionally sends JWKS fetches directly to Auth on
  the private network while issuer and audience remain `AUTH_SERVER_URL`.
- Auth tables and principal types come from `@proj-airi/auth-shared`; no module
  under `server/apps/auth` is imported.

## Railway

Deploy this as the Resource API Railway service. Keep the service Root
Directory at the repository root because the Dockerfile copies shared
workspace packages. The project-level Infrastructure as Code file is
`proj-airi/airi-railway/.railway/railway.ts`. It owns the Dockerfile, start
command, `/readyz` healthcheck, and watch patterns.

Set `AUTH_SERVER_INTERNAL_URL` from Auth's Railway private domain. It is only
the private JWKS route; `AUTH_SERVER_URL` remains the public Auth issuer URL.
See [`server/README.md`](../../README.md#railway-deployment) for the complete
cross-service variable and migration contract.

### Hosted Responses API

`POST /api/v1/openai/responses` accepts authenticated, stateless OpenAI Responses requests.
Use this endpoint when a client sends complete input Items and handles function tools locally.
The endpoint supports JSON and SSE output. It shares the per-user generation quota with Chat Completions.

Add `protocols: ["chat-completions", "responses"]` to each compatible LLM upstream in `LLM_ROUTER_CONFIG`.
An omitted `protocols` field permits Chat Completions only. Aliases retain their configured primary and fallback order.
If no configured route supports Responses, the endpoint returns `503 LLM_PROTOCOL_UNAVAILABLE` before contacting an upstream.
This PR does not update live routing configuration or switch the official client provider.

The request uses `store: false`, which is also the default. Send complete messages, reasoning Items, function calls,
and function outputs in `input`. The endpoint rejects `previous_response_id`, `conversation`, file IDs,
background generation, item references, file search, and code interpreter.
Function and web-search choices must reference tools declared in the same request. An `allowed_tools` choice supports at most 128 references.
Do not use this endpoint for provider-side history.
The total request body limit is 40 MiB after authentication. Other API routes keep the 1 MiB default.
This allows one maximum-size inline file plus the JSON envelope. Use remote URLs or reduce the payload if the total exceeds 40 MiB.

For a Responses-enabled OpenAI upstream at `https://api.openai.com/v1`, web search needs no separate capability flag.
The server reads `abilities.search` from `model-bank/openai` using `overrideModel`, or the dispatched model name when no override exists.
The canonical OpenRouter endpoint also supports search. Its adapter maps `web_search` to the OpenRouter server-tool name.
Other compatible proxies are not treated as OpenAI or OpenRouter. Unknown direct OpenAI models do not receive search requests.
If all protocol-compatible candidates lack search support, the endpoint returns `503 LLM_WEB_SEARCH_UNAVAILABLE`.
Send `tools: [{ "type": "web_search" }]` to make search available. The gateway does not inject tools or change `tool_choice`.
Search filters, approximate location, source inclusion, and `web_search_call` Items pass through the validated request boundary.
A replayed `web_search_call` also selects only a search-capable route, even when the next request omits the search tool.
Keep search Items and citation annotations in the client history for replay and editing.

The Responses operation lives in `operations/responses/index.ts`. Its request contract lives in `operations/responses/request.ts`.

Web search adds no separate Flux debit. The hosted service absorbs the upstream search-call fee.
Search content tokens in the returned usage follow the existing token rate.

A completed result uses `usage.input_tokens` and `usage.output_tokens` with the existing Flux pricing policy.
When usage is absent, the existing per-request rate applies. Failed, incomplete, cancelled, malformed,
and truncated streams incur no debit. Each request has one settlement ID, so duplicate terminal events cannot charge twice.
A client disconnect cancels the upstream reader. A delivered terminal event authorizes settlement. The gateway closes the stream after that settlement attempt.

Before release, configure a Responses-capable upstream and verify authenticated requests and Flux settlement in the target environment.
The architecture and test scope are in [the hosted Responses ADR](../../docs/ai/adr/2026-09-15-hosted-responses.md).

### Generation protocol ownership

The server registry in `src/schemas/generation-protocol.ts` owns supported protocol IDs and create paths.
Configuration, upstream routing, and gateway operations use its inferred types.
Gateway and Langfuse names follow `<protocol>.create`: `chat-completions.create` and `responses.create`.
This changes the old Chat trace name `chat.completion`; update saved trace filters that use it.
HTTP paths and client protocol values do not change.

Wire adapters live in `src/services/adapters/llm/`. Each adapter owns request headers, serialization, and provider capabilities.
Protocol operations own native response handling. The router owns credentials, retries, cancellation, and upstream selection.
To add a protocol, add its registry entry, wire adapter, gateway input contract, and native operation with focused tests.
The adapter registry and gateway types reject missing implementations during typecheck.
Messages API remains unsupported until these pieces exist.

Responses validation reuses `src/services/adapters/llm/schemas/responses.ts`.
This server-owned protocol layer derives schemas from OpenResponses and adds OpenAI search extensions.
It permits provider-side references; the AIRI request policy rejects them for shared upstream accounts.
The schema directory retains its generation input and instructions. Compiled JavaScript is not stored in source.
xsai's existing client patch remains unchanged. No schema export or new peer dependency is added to xsai.
