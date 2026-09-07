# OpenPanel product analytics

AIRI sends product events to a self-hosted OpenPanel project. AI generation events remain in PostHog for AI Analytics.

Use this setup for product events, user profiles, and conversion funnels. It does not migrate historical events, HogQL queries, or saved PostHog dashboards.

## Client configuration

Keep `VITE_ENABLE_POSTHOG` as the existing build switch for analytics. This preserves release workflows and existing opt-out behavior during the provider change.

Set these public GitHub repository variables before a release:

- `OPENPANEL_API_URL`: The HTTPS API base URL, including `/api` when using the bundled proxy.
- `OPENPANEL_CLIENT_ID`: The OpenPanel public write client id.

Release workflows pass these values as `VITE_OPENPANEL_API_URL` and `VITE_OPENPANEL_CLIENT_ID`. Docker builds accept the same build arguments.

Never put a client secret in a Vite variable. Allow only the intended application origins on the public OpenPanel client.

## Server configuration

Set these variables through the API deployment platform:

- `OPENPANEL_API_URL`
- `OPENPANEL_CLIENT_ID`
- `OPENPANEL_CLIENT_SECRET`

Use a separate server write client in the same project. Keep its secret in the deployment platform's secret store.

All three absent disables server product forwarding. A partial configuration fails startup. Existing `POSTHOG_*` variables now configure AI Analytics only.

## Event behavior

Business event names remain unchanged. OpenPanel uses `screen_view` for automatic page views. Automatic outbound-link capture, attribute capture, and replay remain disabled.

Stage clients keep a device id in session storage. A reload in the same tab keeps this id. Logout or a consent change rotates it. Anonymous visitor counts therefore do not have the same semantics as PostHog's persistent browser identity.

Logged-in events use the stable AIRI user id. Checkout sends the device id to the API, which stores it in Stripe metadata. The webhook supplies that device id to OpenPanel.

Query strings and fragments are removed from automatic page URLs and referrers. This prevents OAuth codes from entering those fields.

PostHog receives `$ai_*` events and identity operations. Automatic PostHog page views, page leaves, autocapture, and replay are disabled in stage clients.

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
2. Create the administrator, project, public client, and server client.
3. Configure allowed origins, build variables, and server secrets.
4. Send a marked browser event and a server event to the deployed API.
5. Confirm both events and their user association in OpenPanel.
6. Verify checkout attribution with a test-mode Stripe payment and a replayed webhook.
7. Recreate the required dashboards and reporting queries.
8. Update the published privacy notice for the final deployment.
9. Confirm backup and restore procedures.

Retain PostHog history during migration. Reverting this PR restores the old product event path, but it cannot backfill events captured only in OpenPanel.
