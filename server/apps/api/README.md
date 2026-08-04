# `@proj-airi/api-server`

HTTP and WebSocket backend for AIRI. This app owns auth, billing, chat synchronization, gateway forwarding, and server-side observability export.

## What It Does

- Serves the Hono-based API and WebSocket endpoints.
- Uses Postgres as the source of truth for users, billing, and durable state.
- Uses Redis for cache, KV, Pub/Sub, and Streams.
- Forwards GenAI requests to the configured upstream gateway and records billing from usage.
- Exports traces, metrics, and logs through OpenTelemetry.

## How To Use It

Install dependencies from the repo root and run scoped commands:

```sh
pnpm -F @proj-airi/api-server typecheck
pnpm -F @proj-airi/api-server exec vitest run
pnpm -F @proj-airi/api-server build
```

To run the API together with local PostgreSQL and Redis, use:

```sh
pnpm dev:backend
```

## `AUTH_UI_URL`

`apps/ui-server-auth` is deployed separately from the server image. The API server still owns the historical `/auth/*` entrypoints and redirects them to **`AUTH_UI_URL`**.

Default:

`AUTH_UI_URL=https://accounts.airi.build/ui`

Set this when previewing or deploying auth UI to a different Cloudflare URL.

## `ADMIN_UI_URL`

The admin UI is deployed from the standalone `proj-airi` repository. The API server still owns the historical `/admin/*` entrypoints and redirects them to **`ADMIN_UI_URL`**.

Default:

`ADMIN_UI_URL=https://admin.airi.build`

Set this when previewing or deploying admin UI to a different Cloudflare URL.

## `RATE_LIMIT_TRUSTED_PROXY`

Keep this unset for local and self-hosted deployments. Set
`RATE_LIMIT_TRUSTED_PROXY=railway` when the API runs behind the trusted
Railway/Caddy boundary so anonymous auth requests are keyed by Railway's
canonical `X-Real-IP` instead of the gateway socket address.

## `ADDITIONAL_TRUSTED_ORIGINS` (LAN / Capacitor dev)

When the mobile dev server uses a non-localhost origin (for example `https://10.x.x.x:5273` from `cap copy ios` / `capacitor.config.json`), set **`ADDITIONAL_TRUSTED_ORIGINS`** in `server/apps/api/.env.local` to a comma-separated list of exact origins (parsed and normalized at startup). Example:

`ADDITIONAL_TRUSTED_ORIGINS=https://10.0.0.129:5273,https://198.18.0.1:5273`

Restart the API server after changing this variable.
