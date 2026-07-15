# `@proj-airi/server`

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
pnpm -F @proj-airi/server typecheck
pnpm -F @proj-airi/server exec vitest run
pnpm -F @proj-airi/server build
```

For local observability infrastructure, use:

```sh
docker compose -f apps/server/docker-compose.otel.yml up -d
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

## `ADDITIONAL_TRUSTED_ORIGINS` (LAN / Capacitor dev)

When the mobile dev server uses a non-localhost origin (for example `https://10.x.x.x:5273` from `cap copy ios` / `capacitor.config.json`), set **`ADDITIONAL_TRUSTED_ORIGINS`** in `apps/server/.env.local` to a comma-separated list of exact origins (parsed and normalized at startup). Example:

`ADDITIONAL_TRUSTED_ORIGINS=https://10.0.0.129:5273,https://198.18.0.1:5273`

Restart the API server after changing this variable.

## Local HTTPS API (reverse proxy; no TLS in Node)

When the client runs on **https** (e.g. Vite `dev:https` or Capacitor) while Hono stays on **`http://127.0.0.1:3000`**, WebKit can treat **`https` → `http` API** calls as mixed content. Terminate TLS on a reverse proxy or tunnel (for example **frp**, Caddy, or nginx) that forwards to this API, then point **`API_SERVER_URL`** and the frontend **`VITE_SERVER_URL`** (or equivalent `SERVER_URL`) at that **https** public base URL.
