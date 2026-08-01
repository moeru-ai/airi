# AIRI Auth Server

Standalone authentication and identity application for Project AIRI.

## Responsibilities

- Better Auth session, social login, magic-link, password, and OIDC flows.
- `/api/auth/*`, `/auth/*`, and authentication discovery endpoints.
- Auth-owned Redis configuration, transactional email, and auth telemetry.
- Calling the resource API's authenticated internal boundary before deleting business data.

## Run locally

```bash
pnpm -F @proj-airi/auth-server dev
```

The service reads `.env.local` from this directory. `PUBLIC_URL` is the public issuer origin presented through Caddy; `RESOURCE_SERVER_URL` is the private resource API used for internal calls.

## Do not use it for

- Product APIs, billing, model routing, chat, or WebSocket business state.
- Importing modules from `apps/server`.
- Running the shared database migration history during normal process startup.

Auth tables and principal contracts live in `@proj-airi/auth-shared`. The existing one-shot server schema build remains the migration owner while both applications share one PostgreSQL database.
