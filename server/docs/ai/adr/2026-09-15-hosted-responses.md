# Hosted Responses gateway

Status: accepted

## Decision and scope

The user confirmed this implementation scope and the existing `@xsai/shared-stream` parser.

Issue #2479 defines an authenticated, stateless Responses create endpoint.
This PR implements its server boundary on top of the existing gateway and Flux policy.
The client sends complete input Items. The gateway forces `store: false`.
It rejects conversation references, file IDs, background execution, and hosted tools other than web search.
The user confirmed native web search support for OpenAI upstreams.
The server reuses `model-bank/openai` search capabilities for the effective upstream model.
Only the canonical OpenAI endpoint advertises this provider capability.
Requests opt into search through `tools`; the gateway does not inject tools.
Search calls and sources remain portable input Items. Unsupported search candidates are skipped.

Function tools run on the client and return their output on the next request.

Each upstream explicitly opts into Responses through `protocols: ['responses']`.
An omitted list supports Chat Completions only. This preserves the current configured service contract.
Aliases keep their primary, weighted, and fallback order. Protocol filtering precedes candidate selection.
Unsupported candidates never receive a request. The last attempted HTTP error remains available to the caller.

This change preserves the existing Flux policy and adds no per-search rate.
The service absorbs upstream search-call fees; returned search content tokens use the existing token rate.

Each request owns one billing ID. Completed results use input/output token usage and the existing Flux pricing policy.
Missing usage follows the existing flat-rate policy. Failed, incomplete, cancelled, and truncated streams incur no debit.
A streaming result becomes billable only after a validated terminal event reaches the downstream writer.
JSON results settle after body validation and before the HTTP response returns.
Cancellation before that point wins. A duplicate terminal event cannot charge again.
The gateway stops reading after the terminal event and releases upstream resources.
Metrics, request logs, and generation traces record terminal failures as well as successful requests.

No production configuration, deployment, database migration, or default client protocol change belongs to this PR.
The official provider switch and live Flux acceptance remain release tasks under #2479.
No new rate, billing reservation, realtime session, or search service is introduced.

## Protocol ownership

The user confirmed a server-only protocol consolidation. Client protocol values remain unchanged.
A server protocol registry owns identifiers and HTTP create paths. Operation names derive as `<protocol>.create`.
Config validation, gateway operation keys, routing, and tracing consume that registry.
Each protocol adapter owns request serialization, authentication, and native search eligibility.
The gateway retains protocol-specific response lifecycles and shared billing and telemetry boundaries.
Adding a protocol requires an adapter and gateway input contract; unsupported values never select Chat implicitly.
Messages API is not implemented or advertised by this change.

The xsai patch exports generated Valibot request schemas through a separate `schema` subpath.
It follows xsai's OpenResponses OpenAPI generation workflow. AIRI layers its stateless policy over those schemas.
OpenAI web search extends the OpenResponses contract in that subpath without AIRI-specific restrictions.
The default xsai entrypoint does not import schema code. Upstream submission is a separate publication step.

## Module dependencies

```mermaid
flowchart LR
  HTTP[Authenticated HTTP route] --> Operation[Responses operation]
  HTTP --> Limit[User rate limit]
  Operation --> Alias[Shared alias routing]
  Alias --> Router[LLM router and key rotation]
  HTTP --> Protocols[Server protocol registry]
  Router --> Protocols
  Observe --> Protocols
  HTTP --> Schema[xsai schema subpath and AIRI policy]
  Router --> Catalog[model-bank OpenAI catalog]
  Router --> Upstream[Responses-capable upstream]
  Operation --> Billing[Existing Flux settlement]
  Operation --> Observe[Metrics, logs, generation trace]
```

## Affected files

```text
server/
  apps/api/
    README.md
    package.json
    src/routes/openai/v1/
      index.ts, gateway.ts, model-routing.ts, route.test.ts
      middlewares/traffic-control.ts
      operations/chat-completions/index.ts
      operations/responses/{index.ts,request.ts,request.test.ts}
    src/services/
      adapters/config-kv/definitions.ts
      domain/llm-router/{router.ts,types.ts,tests/router.test.ts}
      domain/llm-tracing/index.ts
      adapters/llm/{index.ts,chat-completions.ts,responses.ts,types.ts}
    src/schemas/generation-protocol.ts
patches/@xsai-ext__responses@0.5.0.patch
  docs/ai/adr/2026-09-15-hosted-responses.md
```

## Request lifecycle

```mermaid
sequenceDiagram
  participant C as Client
  participant G as Gateway
  participant R as Router
  participant U as Upstream
  participant F as Flux ledger
  C->>G: POST responses with complete input
  G->>G: Authenticate, validate, rate limit, authorize balance
  G->>R: Resolve alias and select compatible candidates
  R->>U: POST responses with gateway credential
  U-->>G: JSON or native SSE
  G-->>C: Forward validated terminal result
  alt completed and delivered
    G->>F: Settle once using request ID
  else failed, incomplete, cancelled, truncated
    G->>G: Record failure without debit
  end
  G->>U: Release reader and cancel remaining stream
```

## Verification

Exercise the mounted route with authentication, malformed input, stateful references, search tools, rejected hosted tools, and insufficient Flux.
Cover catalog model matching, compatible-proxy rejection, grouped fallback, portable search Items, citations, and unchanged tool choice.
Cover JSON/SSE completion, usage, upstream errors, split UTF-8 frames, cancellation, duplicate terminal events, and stream EOF.
Verify grouped and ungrouped routing, incompatible candidates, key failover, and preservation of terminal upstream errors.
Run focused gateway, router, schema, and billing tests. CI checks the complete repository.

## References

- [Server scope, Issue #2479](https://github.com/moeru-ai/airi/issues/2479)
- [OpenAI Responses streaming events](https://platform.openai.com/docs/api-reference/responses-streaming)
- [Merged client adapter, PR #2477](https://github.com/moeru-ai/airi/pull/2477)
