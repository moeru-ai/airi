# Auth Server Extraction

The public authentication origin remains `api.airi.build`. Caddy sends the
authentication path set to the private `@proj-airi/auth-server` service and
sends all other traffic to `@proj-airi/server`.

## Runtime boundary

```text
accounts.airi.build                           -> account/login UI
api.airi.build/api/auth/*                     -> Caddy -> private auth-server
api.airi.build/auth/*                         -> Caddy -> private auth-server
api.airi.build/.well-known/oauth-.../api/auth -> Caddy -> private auth-server
api.airi.build/*                              -> Caddy -> resource API
```

The applications are separate workspace packages, process entries, dependency
sets, environment schemas, Docker images, and composition roots:

```bash
pnpm -F @proj-airi/auth-server start
pnpm -F @proj-airi/server start
```

`apps/auth-server` owns Better Auth, OIDC, session/account lifecycle, email,
auth-specific rate limiting, and auth telemetry. `apps/server` owns business
HTTP/WS routes, billing, product events, and the shared database migration
history. Neither app imports the other.

The only shared code is the neutral `@proj-airi/auth-shared` package containing
auth tables, the principal/session contract, and ban-expiry policy. Auth event
facts and account deletion cross the authenticated `/internal/auth/*` HTTP
boundary instead of sharing API services or business tables.

## Configuration

Auth server:

```dotenv
PUBLIC_URL=https://api.airi.build
RESOURCE_SERVER_URL=http://api.railway.internal:3000
AUTH_INTERNAL_SECRET=<same random value on both services>
AUTH_UI_URL=https://accounts.airi.build/ui
```

Resource API:

```dotenv
API_SERVER_URL=https://api.airi.build
AUTH_SERVER_URL=https://api.airi.build
AUTH_INTERNAL_SECRET=<same random value on both services>
```

`PUBLIC_URL` is Better Auth's base URL, issuer, and resource/audience. The
private `RESOURCE_SERVER_URL` is used only for internal API calls and must not
appear in discovery metadata, redirects, or client configuration.

## Railway and Caddy

- Auth Dockerfile: `apps/auth-server/Dockerfile`
- API Dockerfile: `apps/server/production/railway/Dockerfile`
- Both services use `/readyz` for readiness.
- Auth server requires PostgreSQL, Redis, Better Auth/social credentials, and
  email configuration; it does not require Stripe or LLM secrets.
- API does not install Better Auth, OAuth-provider, Resend, or auth CLI packages.

Caddy variables:

```dotenv
AIRI_AUTH_BACKEND_HOST=${{auth-server.RAILWAY_PRIVATE_DOMAIN}}
AIRI_AUTH_BACKEND_PORT=3000
```

## Migration ownership

Both applications currently share one PostgreSQL database. The existing
`@proj-airi/server-schema` one-shot history remains the sole migration owner so
two Drizzle journals cannot race or disagree about cross-schema ordering.
Auth-server startup only checks that its `user` table is ready.

A future separate auth database should first introduce a dedicated migration
job and remove the remaining API authorization projection read; it is not
required for the current code/runtime extraction.
