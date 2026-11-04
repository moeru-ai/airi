# View payment records for Flux purchases

Status: proposed. The requester authorized a small action on each paid recharge record, selected by the original payment processor.

## Decision

Join wallet credits to paid, live payment orders through the existing request ID and account ID.
Add a nullable `paymentOrderId` to each Flux history record.
The shared Flux page makes each recharge row or card clickable with one native button across the record.
Desktop rows use AIRI's trailing arrow, theme-color hover fill, and keyboard focus outline.
Mobile cards show a quiet View order label beside the date. Touch uses a brief neutral press fill, without a persistent highlight.
Hover feedback applies only to devices that support hover. Keyboard focus remains visible on every device.
Enter and Space activate the record. Other transactions remain unchanged.

`GET /api/v1/payments/:id/receipt` checks the signed-in account before it resolves the original processor.
Stripe retrieves the Checkout Session with its invoice and latest charge expanded.
Prefer the hosted invoice URL. Without an invoice URL, use the charge receipt URL.
Apple purchases open Apple's purchase history at `https://reportaproblem.apple.com/`.
Apple does not expose a documented web link for an individual transaction.

Processor selection stays in one payment receipt service. A new processor adds one branch without changing the page or HTTP contract.
Current sales channels, package configuration, client platform, and purchase restrictions do not select the receipt destination.
Resolve Stripe URLs on demand so the application does not persist expiring receipt links.

## Scope and non-goals

This change adds an authenticated read endpoint, one history field, and an action across each recharge record.
It requires no migration, payment settlement change, invoice creation, subscription change, or page redesign.
Missing, deleted, unpaid, and foreign orders return the same not-found error.
Unsupported processors and unavailable receipts return an explicit error. The existing page alert reports the error, and the record remains available for retry.

## Module dependencies

```mermaid
flowchart LR
  Page[Shared Flux page] --> History[Flux history route]
  History --> Ledger[Flux transaction service]
  Ledger --> DB[(Ledger and payment orders)]
  Page --> Route[Payment receipt route]
  Route --> Receipt[Payment receipt service]
  Receipt --> DB
  Receipt --> Stripe[Stripe Checkout API]
  Receipt --> Apple[Apple purchase history URL]
```

## Affected files

```text
packages/
  stage-pages/src/pages/settings/flux.vue
  stage-pages/src/pages/settings/flux.browser.test.ts
  stage-pages/src/pages/settings/components/payment-receipt-button.vue
  i18n/src/locales/{en,zh-Hans}/settings.yaml
server/apps/api/src/
  app.ts
  routes/flux/{index.ts,route.test.ts}
  routes/payments/{index.ts,route.test.ts}
  services/domain/flux-transaction{.ts,.test.ts}
  services/domain/payment/{receipt.ts,tests/receipt.test.ts}
```

## Request sequence

```mermaid
sequenceDiagram
  participant User
  participant Page as Flux page
  participant API
  participant DB
  participant Stripe
  User->>Page: Click View order
  Page->>API: GET payments/:id/receipt with authentication
  API->>DB: Find paid, live order for the signed-in account
  alt Stripe order
    API->>Stripe: Retrieve original session with expanded invoice and charge
    Stripe-->>API: Hosted invoice or receipt URL
  else Apple order
    Note over API: Select Apple purchase history
  end
  API-->>Page: URL
  Page->>Page: Open external page
```

## Test plan

- Check history association, pagination, account isolation, and unrelated grants.
- Check invoice precedence, charge receipts, missing receipts, and provider failures.
- Check Apple orders with Stripe unavailable and unsupported processors.
- Check authentication and rejection before provider access for foreign, deleted, and unpaid orders.
- Check the complete row and card hit areas, keyboard activation, absent purchase packages, and error recovery.
- Run API and shared page tests, workspace typechecks, root typecheck, and repository lint.

## Sources

- [Stripe Checkout retrieval](https://docs.stripe.com/api/checkout/sessions/retrieve)
- [Stripe hosted invoice URL](https://docs.stripe.com/api/invoices/object#invoice_object-hosted_invoice_url)
- [Stripe charge receipt URL](https://docs.stripe.com/api/charges/object#charge_object-receipt_url)
- [Apple purchase history](https://support.apple.com/en-us/118212)
