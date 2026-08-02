# AIRI Auth Server

Standalone authentication and identity application for Project AIRI.

## Responsibilities

- Better Auth session, social login, magic-link, password, and OIDC flows.
- `/api/auth/*`, `/auth/*`, and authentication discovery endpoints.
- Auth-owned Redis configuration, transactional email, and auth telemetry.
- Calling the resource API over the deployment's private network before deleting business data.

## Code layout

The runtime is intentionally flat. Its main boundaries are:

- `auth.ts`: Better Auth configuration and identity lifecycle hooks.
- `routes.ts`: the complete public Auth HTTP surface and request authentication.
- `server.ts`: dependency composition, health checks, and process lifecycle.
- `resource-api.ts`: the single private Auth-to-resource-API boundary.
- `rate-limit.ts` and `otel.ts`: cross-route operational policies.
- `email.ts` and `oidc-jwt-bearer.ts`: substantial external integration modules.

Small shared contracts stay beside those boundaries (`db.ts`, `env.ts`,
`error.ts`, and `origin.ts`). Tests are collected under `src/tests`; Better
Auth schema-generation wiring is isolated under `src/tooling`.

## Run locally

```bash
pnpm -F @proj-airi/auth-server dev
```

The service reads `.env.local` from this directory. `PUBLIC_URL` is the public issuer origin presented through Caddy; `RESOURCE_SERVER_URL` is the private resource API used for internal calls.

To run PostgreSQL, Redis, the resource API, and Auth together from the repository root:

```bash
pnpm dev:backend
```

`server/docker-compose.yaml` exposes only the local Caddy gateway on `http://localhost:6112`; API and Auth
stay on its private network. The internal `/internal/*` boundary has no
application token, and Caddy rejects that path at the public edge.

## Do not use it for

- Product APIs, billing, model routing, chat, or WebSocket business state.
- Importing modules from `server/apps/api`.
- Running the shared database migration history during normal process startup.

Auth tables and principal contracts live in `@proj-airi/auth-shared`. The existing one-shot server schema build remains the migration owner while both applications share one PostgreSQL database.
