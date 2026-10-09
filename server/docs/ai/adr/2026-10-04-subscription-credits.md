# Subscription plan Flux

Status: accepted

## Decision

RevenueCat is the source for entitlement status.
The local database does not store subscription status and does not store webhook events.

The app reads `customerInfo` in the client SDK for the current plan, expiry, and management URL.
The server reads `GET /v1/subscribers/{app_user_id}` to grant plan Flux.

Plan Flux is a second bucket in the Flux wallet. It is not a second billing system.
`user_flux` holds both buckets in one row:

- `flux` is purchased Flux. It does not expire.
- `plan_flux` is plan Flux. It refills to the quota at each reset boundary.
- `plan_quota`, `plan_expires_at`, and `plan_period_start` describe the current billing period.
- `plan_filled_at` is the time of the last refill.
- `plan_reset_at` is an admin reset time for this one wallet.
- `fallback_to_flux` chooses whether purchased Flux pays after plan Flux runs out. The default is off.

One Flux equals 1,000,000 micro-Flux in both buckets.

### Spend

`postFluxUsage` is the only debit path.
It keeps the `flux_usage` idempotency and the wallet row lock.
Settlement takes whole Flux from the plan bucket first.
The rest comes from purchased Flux when the user has no active plan or `fallback_to_flux` is on.
One fee can use both buckets.
A fee that no bucket can pay stays outstanding, as it did before.
A later plan grant or credit pays it.

Admission uses the same rule. It counts the buckets that can pay now.

### Grant

The server does not select a rule from the webhook event type.
A webhook only tells the server that a customer changed.
The server reads the customer's entitlements and calls `BillingService.syncPlan`.
The latest purchase wins when two mapped plans are active.

`syncPlan` stores the quota, the expiry, and the period start. It does not grant Flux directly.
The refill rule below decides the grant.
A smaller quota caps the bucket.
With no active plan, `plan_expires_at` becomes now.

These rules cover purchase, renewal, product change, extension, expiration, refund, and transfer.
A repeated delivery or a late delivery gives the same result, so the server keeps no event log.
`TRANSFER` names its users in `transferred_from` and `transferred_to`. The server reconciles each of them.
A plan without an expiry is not sold and does not grant Flux.

`syncPlan` holds a Postgres advisory lock for the user while it reads RevenueCat.
Two webhooks for one user cannot write an older answer after a newer answer.
The wallet row stays unlocked during the read, so debits continue.
The read has a 5-second timeout.

The webhook returns an error when the read fails or `REVENUECAT_API_KEY` is unset.
RevenueCat then sends the event again.
`TEST` events do not read RevenueCat.
RevenueCat sells plans only. Flux packs stay on Stripe and Apple IAP.

### Refill

One rule fills the plan bucket.
A refill is due when `plan_filled_at` is before the reset boundary of an active plan.
The boundary is the latest of these times:

- `plan_period_start`.
- The start of the current reset window, when `PLAN_FLUX_RESET_INTERVAL` is `day` or `week`. Windows count from the period start.
- `PLAN_FLUX_RESET_AT`, a one-time reset for every wallet.
- `plan_reset_at`, a one-time reset for one wallet.

A reset time in the future does not count until it passes.
A refill sets `plan_flux` to `plan_quota`. Unused plan Flux is forfeit.
A boundary that is not later than the last refill does not refill.
Thus a return to an earlier billing period keeps the spent amount.

No job runs the refill.
Admission counts a due refill when it reads the wallet.
The next settlement writes the refill and its ledger row under the wallet row lock.
A reset for every wallet is one ConfigKV write.

The admin tools write `PLAN_FLUX_RESET_INTERVAL`, `PLAN_FLUX_RESET_AT`, and `plan_reset_at`.
This API has no admin route for them.

Plans are sold by the month. The client lists only packages with a monthly billing period.

A fee that the plan bucket cannot pay stays outstanding while the fallback is off.
The fallback switch does not cancel that fee.
The next refill pays it, or purchased Flux pays it after the plan expires.
One request can exceed the balance by a small amount, the same as in the wallet before plans.

### Expiry

Every read judges expiry. A plan bucket with a past `plan_expires_at` counts as 0.
No job clears it.

### Read

`GET /api/v1/flux` returns `planRemainingPercent` and `fallbackToFlux` with the balance.
The percent is `plan_flux / plan_quota`. It is null without an active plan.
The cached balance can show the amount before a reset for 60 seconds.
The response omits plan Flux counts.
`PUT /api/v1/flux/fallback` saves `fallbackToFlux`.
Chat and speech do not call RevenueCat.

### Ledger

`flux_transaction.pool` is `wallet` or `plan`.
The balance columns of a row describe the bucket in `pool`.
A refill is a `credit` row in the plan pool. Its `balanceBefore` is the forfeited plan Flux.
A settlement that uses both buckets writes one `debit` row for each pool.
Purchased Flux capacity and `GET /flux/history` read only the wallet pool.

The web purchase SDK cannot replace a subscription in the app.
A subscriber opens the management URL to change plans.
The webhook applies the new plan Flux after the store changes the product.

## Scope

Remove the local subscription status mirror and the webhook event log.
Read entitlement status from RevenueCat on the client and on the server.
Keep plan Flux in the Flux wallet.

## Non-goals

Plan Flux recall inside a period that stays active.
A reconciliation job without a webhook.
Showing plan Flux amounts on the plan cards.
Yearly plans.
Flux packs through RevenueCat.
An admin route in this API for resets.
In-app product replacement checkout.
Expiry batches for purchased Flux.

## Module graph

```mermaid
flowchart LR
  Chat[Chat billing] --> Billing[billing-service.ts]
  Speech[speech-billing.ts] --> Billing
  Billing --> Posting[flux-posting.ts]
  Webhook[RevenueCat webhook] --> Sync["revenuecat-subscriptions.ts"]
  Sync --> Reader["revenuecat-subscriber.ts"]
  Reader --> RC[RevenueCat]
  Sync --> Billing
  Client[Client SDK] --> RC
  FluxRoute["GET and PUT /flux"] --> Billing
  FluxRoute --> FluxService[flux.ts]
```

## Sequence

```mermaid
sequenceDiagram
  participant Client
  participant API
  participant RC as RevenueCat
  participant DB
  Client->>RC: Read customerInfo
  Client->>API: GET /flux
  API->>DB: Read user_flux
  API-->>Client: Balance and plan percent
  RC->>API: Webhook for a customer
  API->>DB: Lock the user
  API->>RC: GET /v1/subscribers/{app_user_id}
  RC-->>API: Current entitlements
  API->>DB: Store the period, refill when due
  API-->>RC: 200
  Client->>API: Chat or speech
  API->>DB: Lock user_flux, refill when due, settle
```

## Affected files

```text
server/apps/api/
  drizzle/0032_plan_flux.sql
  src/schemas/{flux,flux-transaction}.ts
  src/services/domain/billing/{billing-service,flux-posting}.ts
  src/services/domain/{flux,flux-cache,flux-transaction}.ts
  src/services/adapters/revenuecat-subscriber.ts
  src/services/adapters/revenuecat-subscriptions.ts
  src/routes/flux/index.ts
  src/routes/revenuecat/operations/webhook.ts
packages/stage-ui/src/stores/auth.ts
packages/stage-ui/src/composables/use-subscription.ts
packages/stage-pages/src/pages/settings/plan.vue
```

## Test plan

Run the plan Flux tests for a new period, a known period, a changed period, an earlier period, no period, and expiry.
Run the reset tests for the interval window, the reset for every wallet, the reset for one wallet, and an expired plan.
Run the settlement tests for the plan-first order, a fee across both buckets, and the fallback switch.
Run the RevenueCat subscriber client tests for the response contract and upstream errors.
Run the RevenueCat subscription sync tests for plan selection.
Run the webhook tests for a repeated event, `PRODUCT_CHANGE`, `EXPIRATION`, `TRANSFER`, and a failed read.
Run the flux route tests for the plan percent and the fallback choice.
Run the client test that maps `customerInfo` to the current plan.
