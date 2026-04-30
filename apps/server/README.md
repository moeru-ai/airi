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

## `ADDITIONAL_TRUSTED_ORIGINS` (LAN / Capacitor dev)

When the mobile dev server uses a non-localhost origin (for example `https://10.x.x.x:5273` from `cap copy ios` / `capacitor.config.json`), set **`ADDITIONAL_TRUSTED_ORIGINS`** in `apps/server/.env.local` to a comma-separated list of exact origins (parsed and normalized at startup). Example:

`ADDITIONAL_TRUSTED_ORIGINS=https://10.0.0.129:5273,https://198.18.0.1:5273`

Restart the API server after changing this variable.

## Local HTTPS API (ngrok; no TLS in Node)

When the client runs on **https** (e.g. Vite `dev:https` or Capacitor) while Hono stays on **`http://127.0.0.1:3000`**, WebKit can treat **`https` → `http` API** calls as mixed content. Use an **https** tunnel that forwards to this API (typical: [ngrok](https://ngrok.com/) http → `127.0.0.1:3000`) and point **`API_SERVER_URL`** / the frontend **`VITE_SERVER_URL`** (or equivalent `SERVER_URL`) at that **https** base URL. Stage UI sends `ngrok-skip-browser-warning` on requests when the host looks like ngrok so the free-tier interstitial does not block API traffic.
