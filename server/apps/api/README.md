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

## LLM request content

Chat Completions and Responses retain diagnostic input, output, and error content
in PostgreSQL. Migration `0029_llm_request_content.sql` adds nullable JSONB columns
to request and attempt tracking. Apply it before deploying the Go Admin reader.

Content keeps text, tool calls, and reasoning. Inline media is replaced with
metadata; remote media is not fetched. Each payload is bounded to 8 MiB, with
explicit partial and truncated states. SSE output stores received data events
in order. It does not prove client delivery. Error-body capture stops after five
seconds and retains partial content if the upstream stalls or disconnects.

Use the authenticated Admin request detail to inspect content. List queries and
owner-facing DTOs do not expose it. Historical requests are not backfilled.
Content follows diagnostic retention; this feature adds no cleanup scheduler.
It is not billing evidence. See the [content ADR](../../docs/ai/adr/2026-09-27-llm-request-content.md).

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

## Flux usage

`flux_usage` records one confirmed micro-Flux fee for each `(userId, source.type, source.id)`. Rows are append-only.
`flux_transaction` records integer balance changes only. `user_flux` stores integer Flux and outstanding micro-Flux.
One Flux equals 1,000,000 micro-Flux.
LLM and TTS fees share one pool. Outstanding fees do not expire.
`BillingService.postFluxUsage({ userId, source: { type, id }, amountMicroFlux, detail? })` accepts confirmed amounts.
The accounting core has no model, provider, turn, attempt, or pricing dependency.
A service puts its own evidence in `detail`. A new service needs a new `source.type` and no new table.
A fee posts once. A replay with the same amount returns the first result. A replay with another amount fails.
A pooled debit can include earlier fees from other services.
Use `flux_usage` for service spend reports. Do not attribute a pooled debit to one service.
Admission reads PostgreSQL. The display cache contains both wallet fields and expires after 60 seconds.
Credits settle affordable outstanding fees. Admin balance changes preserve outstanding fees.
The ledger must always satisfy: sum of fees = debited Flux x 1,000,000 + outstanding micro-Flux.

`GET /api/v1/flux/usage` returns paginated fees from `flux_usage`. Wallet history returns integer balance changes.

Old Redis TTS character counters are not migrated. The old meter already forgave a residual of less than one Flux.
Stop old API writers before the new version starts. Mixed old and new writers are unsupported.

See [the Flux usage ADR](../../docs/ai/adr/2026-10-04-flux-usage.md) for invariants and migration policy.

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
RevenueCat lives on `/api/v1/revenuecat/*`. `GET /packages` lists the
`REVENUECAT_FLUX_PACKS` product-to-Flux map. `POST /webhook` verifies the
dashboard authorization header and HMAC signature over the raw body, then
settles `NON_RENEWING_PURCHASE` events as `revenuecat` evidence receipts.
Subscription lifecycle events sync into `src/services/domain/subscriptions`
(one row per user and entitlement, plus per-period quota allowances).
Flux balance stays self-managed; In-App Currency is not used.

## Subscriptions

Go (`airi_go`, 2000 plan credits) and Plus (`airi_plus`, 5000 plan credits)
are sold through RevenueCat on every store. Apple, Google, Stripe, and Test
Store all enter through the single RevenueCat webhook; `store` is only a
field, so new channels need no server changes.

`src/services/domain/subscriptions` owns sync, status reads, Credit debit,
the Flux-fallback preference (default off), and `deleteAllForUser`. Status
comes from webhook events. Only `EXPIRATION` revokes access. `BILLING_ISSUE`
and `CANCELLATION` keep access until `expires_at`. `INITIAL_PURCHASE`,
`RENEWAL`, and `PRODUCT_CHANGE` open a fresh Credit period and forfeit the
old remainder. Those events also expire every other entitlement for that
user. `UNCANCELLATION` sets the subscription back to active and leaves the
Credit period in place. `SUBSCRIPTION_EXTENDED` moves the open Credit period
end to the new expiration and does not grant Credits. One Credit equals one
Flux.
`src/services/domain/billing/credit-posting.ts` settles both pools in
micro-Credits (1 Credit = 1,000,000 micro-Credits). Chat and speech call
`takePlanCredits`. The plan pays when its micro-Credits cover the whole fee.
Otherwise the wallet pays only when Flux fallback is on. Plan Credits never
touch `user_flux`. They live in `subscription_allowance` with per-request
rows in `subscription_consumption`. Product-to-plan mapping lives in ConfigKV
`REVENUECAT_SUBSCRIPTION_PLANS`.
Status reads the local ledger. A missed webhook stays stale until RevenueCat
resends that event.

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

A completed result settles normalized cost. Missing cost or incomplete output stays pending without an immediate debit.
Each request ID owns one settlement, so duplicate terminal events cannot charge twice.
A client disconnect cancels the upstream reader. A delivered terminal event authorizes settlement. The gateway closes the stream after that settlement attempt.

Before release, configure a Responses-capable upstream and verify authenticated requests and Flux settlement in the target environment.
The architecture and test scope are in [the hosted Responses ADR](../../docs/ai/adr/2026-09-15-hosted-responses.md).

### LLM cost settlement

Hosted Chat Completions and Responses always use normalized-cost settlement.
`LLM_COST_BILLING` contains required price configuration, not an opt-in flag.
For example, `{ "openrouter": { "fluxPerUsd": 1000, "multiplier": 1.5 } }` charges three Flux for 0.002 USD.
This example is not a production sale-price recommendation. No default sale price is supplied.

`LLM_MINIMUM_BALANCE` is the minimum callable balance. It defaults to five Flux.
It is not a fixed request charge or a maximum-cost reservation.
`FLUX_PER_REQUEST` and `FLUX_PER_1K_TOKENS` are no longer read by hosted LLM billing.
Confirmed service fees enter the shared micro-Flux accumulator.

Before any network dispatch, each eligible upstream must have a supported cost adapter and complete pricing.
Missing configuration rejects the request with `LLM_BILLING_UNAVAILABLE`; alias fallback cannot hide this error.
Only the OpenRouter adapter is implemented. Other gateways cannot serve hosted LLM traffic until they have an explicit adapter and prices.

Missing or invalid returned cost, BYOK fees, and incomplete output post no fee. There is no token-rate estimate.
Each request posts `ceil(costUsd * fluxPerUsd * multiplier * 1,000,000)` micro-Flux with source `llm:{requestId}`.
An explicit zero cost posts at zero. Fractional fees accumulate across services before integer wallet settlement.
Zero fees do not create debit ledger rows. Underfunded settlements increment the insufficient-balance metric once, not on replay.
`flux_usage.detail` keeps the price snapshot, cost source, provider, model, and generation ID.
The request log and attempts keep the provider evidence. A request with a log and no `flux_usage` row is unbilled.
Reconcile unbilled requests by joining the request log with `flux_usage` on the request ID.
The request log no longer stores a Flux amount. Read the fee from `flux_usage` by request ID.
The `airi.billing.flux.consumed` metric and the `airi.billing.flux_consumed` span attribute report the fee in Flux, not the integer debit.
Migration 0030 drops the `llm_request_settlement` archive and `llm_request_log.flux_consumed`.
Export the historical settlements before this migration runs.
There is no automatic reconciliation worker in this release.

A future model-price-table adapter is a supported pricing mode, not a fallback.
It must validate model rates before dispatch and produce standardized USD cost with a versioned rate snapshot and measured usage.
This release does not implement that adapter.

Request tracking #2673 is merged. Billing #2644 adds only migration 0027.
Apply `0026_llm_request_tracking.sql` before `0027_llm_cost_settlement.sql`.
Configure supported provider prices before deploying the billing change. Missing prices stop LLM calls.
These migrations replace unpublished PR drafts and must not be applied over an already-applied earlier draft.

See the [billing ADR](../../docs/ai/adr/2026-09-23-provider-cost-billing.md) for accounting ownership and verification boundaries.

### LLM request tracking

Tracking extends the existing request log and records each local upstream dispatch in `llm_request_attempt`.
Tracking has no settlement-table dependency. Its diagnostic Flux summary is not the authoritative bill.
Apply `0026_llm_request_tracking.sql` before deploying.

| Fields | Meaning |
| --- | --- |
| Gateway and upstream provider | Routed hostname and inference provider reported by the gateway; distinct from the billing adapter ID. |
| Requested, routed, upstream and response models | Client alias, selected route, dispatched model and reported response model. |
| Request, generation, session and interaction IDs | Request correlation, gateway generation and product context. |
| Status, state, timing and routing | Request/attempt outcomes, first output and local retry counters. |
| Tokens and provider usage | Totals, cache reads/writes, reasoning and bounded provider-specific facts. |
| Metadata and dimensions | Versioned extensibility without storing full prompts, completions or headers. |

Unknown facts stay null. Hidden retries inside an external gateway are not local attempts.
Generation-only details require a future lookup adapter. New frequently queried dimensions can gain explicit columns later.

Authenticated owner-scoped list/detail APIs are `/api/v1/llm-requests` and `/api/v1/llm-requests/:requestId`.
They omit raw evidence, credential references and internal price snapshots.
There is no Activity UI or cross-user admin API in this change.

Request and attempt writes happen before dispatch. A tracking write failure stops dispatch.
Final diagnostic writes remain best effort. Charged Flux in logs is observational, not an accounting authority.
`recoverStaleRequests(before)` marks stale running observations unknown without charging or replaying upstream calls.
There is no automatic recovery or retention scheduler. Diagnostic deletion does not delete accounting evidence.

The [request tracking ADR](../../docs/ai/adr/2026-09-27-llm-request-tracking.md) defines ownership, lifecycle and query boundaries.

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

## Apple sandbox purchases on the shared API

Keep `APPLE_IAP_ENV=production` to accept real App Store purchases.
Set `APPLE_IAP_SANDBOX_USER_IDS` to a comma-separated list of exact internal
user IDs for dedicated test accounts. Do not use email addresses, Apple IDs,
or `appAccountToken` values in this list. Restart the API after a change.
An empty list disables Sandbox verification on the production API.
Sandbox-only deployments also require this list before they can grant Flux.

This list enables Sandbox JWS verification beside Production verification.
Both use Apple's signature checks. It never enables Xcode's unsigned mode.
Both `/api/v1/apple-iap/transactions` and `/api/v1/apple-iap/notifications`
check the resolved Sandbox account before settlement. A blocked device gets
403 and can retry later. A blocked notification gets 200 without a grant.

Use **new, dedicated accounts**. Sandbox Flux enters their existing balance
and can spend real provider resources. This is account-level access control,
not a separate wallet or database. Do not use a normal account for this list.
Sandbox orders use `sandbox:<bundleId>:<transactionId>` as the processor order
ID from their first settlement. The existing `(processor, processor_order_id)`
unique index prevents repeat and concurrent grants. This rollout assumes no
historical Sandbox orders and no old Sandbox writers, as confirmed by the
deployment owner. It requires no schema migration.
Production order IDs do not change.

Before the first device test:

1. Deploy the change and configure `APPLE_IAP_APPS` with each bundle and App Store Connect ID.
2. Add a dedicated account's internal user ID to `APPLE_IAP_SANDBOX_USER_IDS`.
3. Configure `APPLE_FLUX_PACKS` in ConfigKV, not in environment variables. Use exact App Store product IDs and positive `fluxAmount` values.
4. Set the App Store Connect Sandbox Notifications V2 URL to the public `/api/v1/apple-iap/notifications` endpoint.
5. Install a build with the iOS settlement fixes. Sign in to the dedicated AIRI account and complete a sandbox purchase.

Check purchase credit, device retries, and duplicate Apple notifications.
Each purchase must credit once. Check that a normal account cannot receive
Sandbox Flux. A TestFlight purchase uses Sandbox and does not charge money.
A test notification alone does not prove purchase settlement.

Remove the user IDs and restart the API after testing. Removing an ID does
not delete its existing Flux balance. Keep test accounts separate after the test.
Live sandbox purchases and notification delivery require deployment verification.
