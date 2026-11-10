# Stripe Checkout customer creation

Status: accepted. The requester confirmed customer creation for unbound users and reuse for bound users.

## Decision

For users without an active Stripe customer binding, Checkout sends `customer_creation: 'always'` and the user email.
For users with a binding, Checkout sends the existing `customer` ID and omits the creation option and email.

Stripe defaults to conditional customer creation for one-time payments.
An email alone does not require a Customer object or select an existing Customer.
See the [Stripe Checkout parameters](https://docs.stripe.com/api/checkout/sessions/create#checkout_session_create-customer_creation).

Existing settlement stores the returned Customer ID in `payment_customer` when it credits the order.
The next checkout reads this binding through `PaymentService.openPending`.
Local orders already associate payments with users. Customer creation adds a persistent identity within Stripe.

## Scope and non-goals

This change updates Checkout parameters and regression coverage. It requires no database migration or HTTP contract change.
It does not backfill historical orders, save payment methods, change Flux grants, or deploy services.
Concurrent checkouts before the first binding can create multiple Stripe customers. This change does not serialize checkout creation.
Historical Stripe customers without a local binding are not matched by email.

## Dependencies and affected files

```mermaid
flowchart LR
  Checkout[Checkout operation] --> Payment[PaymentService]
  Checkout --> Stripe[Stripe Checkout]
  Stripe --> Webhook[Verified webhook or reconciliation]
  Webhook --> Payment
  Payment --> DB[Orders, customer bindings, and Flux ledger]
```

```text
server/
  apps/api/src/routes/stripe/operations/checkout.ts
  apps/api/src/routes/stripe/checkout.test.ts
  docs/ai/adr/2026-09-29-stripe-checkout-customer.md
```

## Payment sequence

```mermaid
sequenceDiagram
  participant Checkout
  participant Payment as PaymentService
  participant Stripe
  participant Receipt as Webhook or reconciliation
  Checkout->>Payment: openPending(userId)
  Payment-->>Checkout: order ID and active customer ID
  alt No active customer binding
    Checkout->>Stripe: create session with customer_creation=always and email
  else Active customer binding
    Checkout->>Stripe: create session with customer ID
  end
  Stripe-->>Receipt: Completed paid session with customer ID
  Receipt->>Payment: settle claim using payment_order_id and session ID
  Payment->>Payment: Credit Flux and store customer binding in one transaction
  Note over Payment: A paid order ignores duplicate settlement
```

## Test plan

- Require customer creation when no active binding exists, including a deleted binding.
- Settle a paid session through the existing receipt mapper and payment service.
- Verify the customer binding, Flux balance, and duplicate settlement behavior.
- Verify that the next checkout reuses the saved customer without creation or email parameters.
- Run the Stripe and payment tests, API typecheck, and repository lint.
- Mock Stripe at its SDK boundary. A real Stripe checkout remains outside automated test coverage.
