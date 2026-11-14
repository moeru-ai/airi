# OpenPanel product analytics

AIRI sends product events to a self-hosted OpenPanel project. Langfuse handles AI tracing through the existing server integration.

The clients and the API also send each product event to PostHog in parallel, while the two data sets are compared. See `server/docs/ai/adr/2026-11-09-product-analytics-posthog.md`.

Use this setup for product events, user profiles, and conversion funnels. It does not migrate historical events, HogQL queries, or saved PostHog dashboards.

## Client configuration

Use `VITE_ENABLE_ANALYTICS` as the build switch for app analytics. Existing user opt-out behavior remains active. The production docs site records page views separately.

Client builds use the public API URL and write client id from `packages/stage-shared/src/analytics/openpanel.ts`.
The stage apps and auth UI share this configuration. CI variables and Docker build arguments are not required for these values.

Never put a client secret in a Vite variable.

OpenPanel accepts a client request when its `Origin` header is in the allowed origins of the project. The desktop app cannot pass this check: Electron sends no `Origin` header from a `file://` page. OpenPanel answers 401 `Ingestion: Invalid cors or secret`, and the SDK does not report this error.

Thus the public write client has `"ignoreCorsAndSecret" = true` in the `clients` table of the OpenPanel PostgreSQL database. OpenPanel then skips the origin check and the secret check for this client. No dashboard page and no API sets this column. Set it with SQL, and wait five minutes for the client cache. Revenue events still need the client secret.

## Server configuration

Set these variables through the API deployment platform:

- `OPENPANEL_API_URL`
- `OPENPANEL_CLIENT_ID`
- `OPENPANEL_CLIENT_SECRET`

Use a separate server write client in the same project. Keep its secret in the deployment platform's secret store.

All three absent disables server product forwarding. A partial configuration fails startup.

## Event behavior

Business event names remain unchanged. OpenPanel uses `screen_view` for automatic page views. Automatic outbound-link capture, attribute capture, and replay remain disabled.

Stage clients keep a device id in session storage. A reload in the same tab keeps this id. Logout or a consent change rotates it. Anonymous visitor counts therefore do not have the same semantics as PostHog's persistent browser identity.

Logged-in events use the stable AIRI user id. Checkout sends the device id to the API, which stores it in Stripe metadata. The webhook supplies that device id to OpenPanel.

Query strings and fragments are removed from automatic page URLs and referrers. This prevents OAuth codes from entering those fields.

The installed apps report a page address that stands for the app, because OpenPanel groups pages by origin and path:

| Surface | Reported page | Real page URL |
| --- | --- | --- |
| Desktop app | `https://desktop.airi.moeru.ai/<route>` | `file://` and a hash route. It holds a directory of the user's computer. |
| Mobile app | `https://pocket.airi.moeru.ai/<route>` | `https://localhost` on Android, `capacitor://localhost` on iOS |

No server answers these hosts. To compare one page across surfaces, break down `screen_view` by `path` and by `app_surface`. Versions before this change report the real page URL.

Two properties on each stage app event tell where the event comes from:

| Property | Meaning | Values |
| --- | --- | --- |
| `app_surface` | Kind of device | `web`, `mobile`, `desktop` |
| `app_client` | Client app that sent the event | `stage-web`, `stage-pocket`, `stage-tamagotchi` |

For a new client app, add an `app_client` value and keep the three `app_surface` values. Desktop versions before this change report the surface `electron` and no `app_client`. In a report, read `electron` and `desktop` as the same surface.

Per-generation analytics events are removed. Completed `message_round` events retain model, token usage, duration, and round identifiers.
`message_sent` retains provider selection. `message_round_failed` retains the failure stage and error code.
Official model tracing, operational metrics, request logs, and billing remain in their existing services.
No client sends prompts or model responses to OpenPanel.

## Conversion delivery

The billing transaction suppresses replayed one-time payment conversions. Only a transaction that applies the Flux credit emits the conversion.

Server delivery makes one request with a five-second timeout. OpenPanel does not provide PostHog's stable UUID deduplication contract. An ambiguous request is not retried.

Delivery remains best effort. A network failure or process exit can lose a conversion. Use billing records for financial totals. The `event_id` property supports reconciliation.

## Deployment

The deployment uses the official `self-hosting` source at commit `cd24bb838301df1a9087e2e132b344e5b8a99963`.

The stack includes Caddy, PostgreSQL, Redis, ClickHouse, API, Dashboard, and one worker. Persistent volumes hold all database state.

Deployment adjustments:

- Generate the PostgreSQL password and cookie secret on the host.
- Require successful migrations before the API starts.
- Create the `openpanel` ClickHouse database before the first API migration.
- Allow 120 seconds for API, Dashboard, and worker startup checks.
- Keep database ports private.
- Keep the proxy on loopback until the domain and TLS configuration are complete.
- Pin the deployed application image digests before later upgrades.

AWS Systems Manager manages the host. Public SSH is closed. Automatic snapshot management requires a separate approved AWS service role.

## Release checks

Before merging and releasing:

1. Confirm the public domain, DNS, and HTTPS certificate.
2. Confirm the administrator, project, public client, and server client.
3. Configure allowed origins and server secrets.
4. Send a marked browser event and a server event to the deployed API.
5. Confirm both events and their user association in OpenPanel.
6. Verify checkout attribution with a test-mode Stripe payment and a replayed webhook.
7. Recreate the required dashboards and reporting queries.
8. Update the published privacy notice for the final deployment.
9. Confirm backup and restore procedures.

Retain PostHog history during migration. Reverting this PR restores the old product event path, but it cannot backfill events captured only in OpenPanel.
