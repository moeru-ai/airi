# Account events stream

Status: accepted. The cross-repository account notifications contract (revision 2 of 2026-10-19) fixes the envelope, the stream infrastructure, the account events, and the producer rule.

## Context

Cloud (`proj-airi/backend`) owns the user inbox that the client shows as "Notifications".
Some notifications start from facts that only this API knows: a subscription renewal, a failed subscription payment, and a user deletion.
Cloud and this API share one Redis instance through `REDIS_URL`.

moeru-ai/airi #1792 removed an earlier Redis Streams pipeline. Its `debitFlux` caller ignored `XADD` failures, so a lost event did not fail a request and nothing retried it.

## Decision

Redis Streams are shared API infrastructure in `server/apps/api/src/libs/redis/stream.ts`, next to `cache.ts`. Account events are the first stream that uses it.

### Infrastructure

- `defineStream({ key, maxLength, events })` returns a typed stream definition. `events` maps each `type` to `{ version, payload }`, where `payload` is a Valibot schema. It checks the key, the limit, and each version when the module loads.
- `createStreamPublisher(redis, definition)` returns `{ publish(type, { id, payload, occurredAt? }) }`. The payload type follows `type`. `publish` validates the input, encodes the envelope, and runs `XADD <key> MAXLEN ~ <maxLength> * ...`.
- `occurredAt` is the publish time when the producer omits it.

Every entry has the same flat string envelope. The envelope has no domain fields:

| Field | Value |
| --- | --- |
| `id` | Producer event ID. Consumers use it as the dedupe key. |
| `type` | Event type, for example `user.deleted` |
| `version` | Payload schema version as a decimal string |
| `occurredAt` | RFC 3339 UTC timestamp |
| `payload` | JSON object as a string |

### Add a stream or an event

The infrastructure does not change. Edit only the domain module that owns the stream:

1. To add an event, add a `type` with `version: 1` and its payload schema to the `defineStream` call.
2. To change a payload in a breaking way, increase its `version`. Deploy the consumer handler for the new version first.
3. To add a stream, call `defineStream` in the domain module. Provide `createStreamPublisher(redis, definition)` through `injeca` in `app.ts`.

### Account events

`src/services/adapters/account-events.ts` defines the `airi:account-events` stream with `maxLength` 100000. Cloud reads it with the `cloud-inbox` consumer group. The consumer is not part of this repository.

| `type` | `version` | `payload` | `id` |
| --- | --- | --- | --- |
| `subscription.renewed` | `1` | `{"userId", "plan", "periodEnd": RFC3339}` | `<provider>:<provider event id>` |
| `subscription.payment_failed` | `1` | `{"userId", "plan", "retryAt"?: RFC3339}` | `<provider>:<provider event id>` |
| `user.deleted` | `1` | `{"userId"}` | `user-deletion:<userId>` |

The payload schemas are strict, so a field outside the contract fails the publish.

### Producer rule

`publish` never swallows a failure. A validation error, a Redis error, or a null `XADD` reply rejects the publish.
Each publish runs inside a request that its caller retries:

- The RevenueCat webhook publishes after the Capacitor reconciliation. A publish failure returns 500, so RevenueCat sends the event again.
- The user deletion pipeline publishes `user.deleted` in a handler with priority 40, after every soft delete. A publish failure fails `POST /internal/auth/user-deletion`, so Auth does not hard-delete the user and retries the deletion.

A retry can append the same `id` again. The reconciliation and the soft deletes are idempotent, and Cloud deduplicates on `id`.

This design differs from #1792 in these points:

- The #1792 stream was published from a billing write and continued when `XADD` failed. This design fails the request.
- The #1792 pipeline had a worker in this API. This API now only produces. Cloud owns the consumer, its retries, and its dead-letter stream.
- The #1792 pipeline made Redis part of the billing path. Here, Postgres stays the truth for billing. The stream only carries notification facts.

### Provider event mapping

| Provider | Provider event | Account event | Values |
| --- | --- | --- | --- |
| RevenueCat | `RENEWAL` | `subscription.renewed` | `userId` = `app_user_id`. `plan` = `product_id`. `periodEnd` = `expiration_at_ms`. `occurredAt` = `event_timestamp_ms`. |
| RevenueCat | `BILLING_ISSUE` | `subscription.payment_failed` | `userId` = `app_user_id`. `plan` = `product_id`. RevenueCat sends no retry time, so `retryAt` is not set. |
| Stripe | none | none | Stripe sells only one-time Flux packages. The webhook ignores sessions that are not `mode: payment`, and no subscription event exists. |
| Apple IAP | none | none | Apple IAP sells only consumables. Notifications other than `ONE_TIME_CHARGE` are ignored. |

`plan` is the store product ID. It is also the key of the `REVENUECAT_CAPACITORS` config.

A RevenueCat event counts only for the store environment of the deployment. The rule is the same as the Capacitor grant in [RevenueCat sandbox subscriptions](./2026-10-14-revenuecat-sandbox-subscriptions.md).
TestFlight purchases are sandbox purchases, so a production user gets no notification for a sandbox renewal.

A `RENEWAL` or `BILLING_ISSUE` event without the required fields returns 400 before the reconciliation.

## Scope and non-goals

This change adds the stream infrastructure and the account events stream. It publishes from the RevenueCat webhook and the deletion pipeline, and wires them in `app.ts`.

It does not add a TypeScript consumer, a worker, a dead-letter stream, or a stream for `flux.granted`. Admin delivers `flux.granted` in process.
It does not add Stripe subscriptions. It does not change the Capacitor reconciliation or the deletion handlers that exist.

## Dependencies

```mermaid
flowchart LR
  RC[RevenueCat] -->|webhook| Webhook[routes/revenuecat/operations/webhook.ts]
  Webhook --> Sync[revenuecat-subscriptions.ts]
  Webhook -->|countsFor| Subscriber[revenuecat-subscriber.ts]
  Webhook -->|publish| Publisher[createStreamPublisher]
  Auth[Auth service] -->|POST /internal/auth/user-deletion| Internal[routes/internal-auth.ts]
  Internal --> Deletion[domain/user-deletion]
  Deletion -->|priority 40 handler| Publisher
  Definition[adapters/account-events.ts accountEventsStream] -->|defineStream| Publisher
  Publisher --> Stream[libs/redis/stream.ts]
  Stream -->|XADD| Redis[(Redis airi:account-events)]
  Redis -->|XREADGROUP cloud-inbox| Cloud[proj-airi/backend Cloud]
```

## Affected files

```text
server/
  apps/api/src/app.ts
  apps/api/src/app.test.ts
  apps/api/src/libs/redis/stream.ts
  apps/api/src/libs/redis/stream.test.ts
  apps/api/src/libs/tests/redis.ts
  apps/api/src/routes/internal-auth.test.ts
  apps/api/src/routes/revenuecat/index.ts
  apps/api/src/routes/revenuecat/operations/webhook.ts
  apps/api/src/routes/revenuecat/route.test.ts
  apps/api/src/services/adapters/account-events.ts
  apps/api/src/services/adapters/account-events.test.ts
  apps/api/src/services/adapters/revenuecat-subscriber.ts
  apps/api/src/services/domain/user-deletion/types.ts
  apps/api/README.md
  docs/ai/adr/2026-10-18-account-events-stream.md
```

## Sequence

```mermaid
sequenceDiagram
  participant RC as RevenueCat
  participant API
  participant PG as Postgres
  participant R as Redis
  RC->>API: POST /revenuecat/webhook (RENEWAL, id)
  API->>API: Validate the event fields
  API->>PG: Reconcile the Capacitor (idempotent)
  API->>R: XADD airi:account-events (id = revenuecat:<id>)
  alt XADD fails
    API-->>RC: 500
    RC->>API: Same event again
  else XADD succeeds
    API-->>RC: 200
  end
```

```mermaid
sequenceDiagram
  participant Auth
  participant API
  participant PG as Postgres
  participant R as Redis
  Auth->>API: POST /internal/auth/user-deletion
  API->>PG: Soft-delete handlers (priority 20 and 30)
  API->>R: XADD user.deleted (priority 40)
  alt XADD fails
    API-->>Auth: 500, user row stays
    Auth->>API: Retry the whole deletion
  else XADD succeeds
    API-->>Auth: 200
    Auth->>Auth: Hard-delete the user
  end
```

## Test plan

- `defineStream` rejects an empty key, a limit that is not a positive integer, and a version that is not a positive integer.
- `publish` writes the envelope with the version of the type, sets a missing `occurredAt`, and trims with `MAXLEN ~ <maxLength>`.
- `publish` rejects an invalid ID, date, payload, or type, and writes nothing.
- `publish` rejects when `XADD` fails or returns null.
- The account events stream writes the three contract payloads at version 1 and rejects fields outside the contract.
- `RENEWAL` and `BILLING_ISSUE` each publish one event after the reconciliation.
- A publish failure returns 500. The retry publishes the same `id` and does not grant Flux again.
- Other event types, and sandbox events of production users, publish nothing.
- A `RENEWAL` without `expiration_at_ms` returns 400 before the reconciliation.
- The deletion publishes `user.deleted` after the soft deletes. A publish failure fails the deletion request with 500.
