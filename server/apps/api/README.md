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

Web search adds no separate Flux debit. Under token pricing, the hosted service absorbs the upstream search-call fee.
Under OpenRouter cost pricing, any search fee included in `usage.cost` contributes to the Flux charge.

A completed result uses the configured Flux pricing policy described below.
Under token pricing, missing usage selects the per-request rate. Failed, incomplete, cancelled, malformed,
and truncated streams incur no immediate debit. OpenRouter cost pricing saves these receipts for reconciliation.
Each request has one settlement ID, so duplicate terminal events cannot charge twice.
A client disconnect cancels the upstream reader. A delivered terminal event authorizes settlement. The gateway closes the stream after that settlement attempt.

Before release, configure a Responses-capable upstream and verify authenticated requests and Flux settlement in the target environment.
The architecture and test scope are in [the hosted Responses ADR](../../docs/ai/adr/2026-09-15-hosted-responses.md).

### LLM Flux pricing

The default policy charges `ceil((input + output) / 1000 * FLUX_PER_1K_TOKENS)`, with a minimum of one Flux.
Missing token counts select `FLUX_PER_REQUEST`. The schema defaults are one Flux per thousand tokens and five Flux per request.
These are configuration defaults, not a statement about production prices.

`LLM_COST_BILLING` maps provider IDs to positive `fluxPerUsd` and `multiplier` numbers. This configuration has no default.
For example, `{ "openrouter": { "fluxPerUsd": 1000, "multiplier": 1.5 } }` charges three Flux for a reported cost of 0.002 USD.
This example is not a recommended sale price.
Provider adapters convert wire usage into normalized USD costs. Only the OpenRouter adapter is implemented in this version.
Its trusted hostname is `openrouter.ai`, and its stored provider ID is `openrouter`.
Unconfigured providers and providers without an adapter keep the token policy, even when they return a `cost` field.
Adding a configuration entry alone does not implement an adapter.

Each cost charge uses `usage.cost * fluxPerUsd * multiplier`. It does not apply another cache discount.
Decimal arithmetic rounds each cost up to one micro-Flux. One Flux equals 1,000,000 micro-Flux.
The account retains fractional charges until they reach one whole Flux. An explicit zero cost settles at zero.
The integer wallet, top-up amounts, and transaction API keep their existing units.

`llm_request_settlement` retains provider ID, usage evidence, generation ID, price snapshot, and settlement status.
`llm_request_log` owns request summaries. `llm_request_attempt` records each local upstream dispatch.
Missing or invalid cost, BYOK usage, and interrupted results create pending receipts without a token-rate fallback.
`settleLlmCost` can reconcile a pending receipt with recovered usage and its original request ID.
It uses the saved price snapshot and rejects a different provider or generation ID.
This version has no automatic generation lookup, reconciliation worker, or operator UI.
Automatic lookup belongs to phase two. Phase one leaves pending receipts uncharged and monitors their volume.
Pending receipts are not free usage. They do not automatically debit the wallet later in this version.

Apply `0026_llm_request_accounting.sql` before deploying this code, even when cost pricing is disabled.
The migration preserves existing balances and initializes each fractional remainder to zero.
Then configure prices only after charge samples agree with the OpenRouter account history.
Do not enable this policy for OpenRouter keys that use BYOK provider credentials.

Authorization still checks the `FLUX_PER_REQUEST` balance. It does not reserve the maximum output cost.
Partial balances drain to zero. The ledger and receipt retain unpaid whole Flux for review.
Each generated server request ID owns one settlement. A new HTTP retry is a new request, not a replay of the old ID.
The [cost billing ADR](../../docs/ai/adr/2026-09-23-provider-cost-billing.md) describes the transaction boundary and test scope.

#### Cost receipt monitoring

Use receipts, not `flux_consumed = 0`, to count unresolved charges.
A zero debit can mean free usage, a fractional charge, a pending receipt, or an empty wallet.
These reports cover settlement records, including token/request policies and unresolved dispatches. Filter by `method = 'provider_cost'` for cost-only reports.

```sql
SELECT
  count(*) AS receipts,
  count(*) FILTER (WHERE billing_status = 'pending') AS pending,
  round(100.0 * count(*) FILTER (WHERE billing_status = 'pending')
    / nullif(count(*), 0), 2) AS pending_percent,
  count(*) FILTER (WHERE billing_status = 'pending' AND generation_id IS NULL) AS pending_without_id,
  coalesce(sum(requested_flux - flux_consumed) FILTER (WHERE billing_status = 'settled'), 0) AS unpaid_flux
FROM llm_request_settlement
WHERE billing_status IS NOT NULL AND created_at >= now() - interval '24 hours';

SELECT billing_provider, pending_reason, model, count(*) AS receipts, min(created_at) AS oldest
FROM llm_request_settlement
WHERE billing_status = 'pending'
GROUP BY billing_provider, pending_reason, model
ORDER BY receipts DESC;

SELECT billing_provider, request_id, generation_id, model, pending_reason, created_at
FROM llm_request_settlement
WHERE billing_status = 'pending'
ORDER BY created_at
LIMIT 100;
```

The request log and `flux_transaction` share `(user_id, request_id)`.
Historical rows retain a null request ID. New correlated requests have a unique row per user and request ID.
Cost settlement updates the settlement, wallet, remainder, and ledger in one transaction.
Pending evidence is saved first, so a failed debit does not discard the recovered cost.
Later observations cannot overwrite settlement evidence. Diagnostic rows may be removed without deleting accounting records.
Pending and settled settlement rows must follow ledger retention rules. Do not purge them as disposable access logs.

#### Gateway request details

Chat Completions and Responses record the available gateway facts for both cost and token billing:

| Fields | Meaning |
| --- | --- |
| `gateway`, `upstream_provider`, `billing_provider` | Routed hostname, inference provider reported by the gateway, and trusted cost adapter ID. These are different identities. |
| `requested_model`, `model`, `upstream_model`, `response_model` | Client alias, selected route, dispatched model, and model reported in the response. |
| `request_id`, `generation_id`, `session_id`, `protocol`, `stream` | Local correlation, gateway generation, conversation, and transport. |
| `duration_ms`, `time_to_first_token_ms`, `status`, `routing` | Request duration, first output timing, final outcome, and router counters for the selected alias candidate. |
| Token columns and `provider_usage` | Queryable token totals, cache reads/writes, reasoning tokens, and bounded usage evidence, including provider-specific fields. |
| Finish reasons, `response_status`, `provider_metadata` | Reported completion state and selected response metadata, including service tier, fingerprint, and upstream IDs when returned. |
| Settlement fields | Original price, normalized USD cost, micro-Flux charge, pending reason, and requested/charged Flux, stored separately. |

Missing gateway facts stay null. Optional malformed observation fields do not discard valid billing usage.
Provider metadata excludes prompt/completion bodies and request headers. Adapters may add safe gateway-specific facts to JSON metadata without a table migration.
This records information returned on the request path. OpenRouter generation-only details still require a future lookup adapter.
The schema supports richer Activity views; this change does not add an Activity API or interface.

Structured runtime logs use `event = llm.cost_receipt` and `billingStatus = pending | settled | failed`.
Pending logs include the reason. Failed logs identify transactions that could not save a receipt.
Do not add pending requests to a USD loss total when their cost is unknown.
Monitor persistence errors separately because they are absent from these SQL reports.
Requests and attempts are saved before dispatch. A crash can still leave unknown results or no generation ID.
Owner-scoped list/detail APIs use `/api/v1/llm-requests` and `/api/v1/llm-requests/:requestId`.
They omit raw evidence, credential references, and internal prices. There is no Activity UI yet.
`recoverStaleRequests(before)` marks stale running observations unknown. It does not charge or replay upstream calls.
Evidence is limited to 16,384 JSON characters with common content and credential keys removed.
Reassess automatic lookup when pending volume or known unpaid cost becomes material.
Choose an alert threshold after representative traffic provides a baseline. This change does not install an alert or dashboard.

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
