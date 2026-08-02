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

`server/apps/auth` owns Better Auth, OIDC, session/account lifecycle, email,
auth-specific rate limiting, and auth telemetry. `server/apps/api` owns business
HTTP/WS routes, billing, product events, and the shared database migration
history. Neither app imports the other.

Auth tables, the principal/session contract, and ban-expiry policy live in the
neutral `@proj-airi/auth-shared` package. Node boot primitives used by both
processes live in `@proj-airi/server-node-shared`. Auth event facts and account
deletion cross the private `/internal/auth/*` HTTP boundary instead of sharing
API services or business tables.

## Configuration

Auth server:

```dotenv
PUBLIC_URL=https://api.airi.build
RESOURCE_SERVER_URL=http://api.railway.internal:3000
AUTH_UI_URL=https://accounts.airi.build/ui
```

Resource API:

```dotenv
API_SERVER_URL=https://api.airi.build
AUTH_SERVER_URL=https://api.airi.build
AUTH_SERVER_INTERNAL_URL=http://auth-server.railway.internal:3000
```

`PUBLIC_URL` is Better Auth's base URL, issuer, and resource/audience. The
private `RESOURCE_SERVER_URL` is used only for internal API calls and must not
appear in discovery metadata, redirects, or client configuration.

The internal contract deliberately has no application-level token. Its trust
boundary is the Railway private network: the API service has no direct public
ingress, and Caddy must reject `/internal/*` instead of proxying it.
`AUTH_SERVER_INTERNAL_URL` changes only where the API downloads JWKS; JWT
issuer and audience validation continue to use the public `AUTH_SERVER_URL`.

## Railway and Caddy

- Auth Dockerfile: `server/apps/auth/Dockerfile`
- API Dockerfile: `server/apps/api/production/railway/Dockerfile`
- Both services use `/readyz` for readiness.
- Auth server requires PostgreSQL, Redis, Better Auth/social credentials, and
  email configuration; it does not require Stripe or LLM secrets.
- API does not install Better Auth, OAuth-provider, Resend, or auth CLI packages.

Caddy variables:

```dotenv
AIRI_AUTH_BACKEND_HOST=${{auth-server.RAILWAY_PRIVATE_DOMAIN}}
AIRI_AUTH_BACKEND_PORT=3000
```

The public Caddy route set must include an explicit `/internal/*` rejection.
The repository's local compose applies the same policy through
`server/dev/caddy/Caddyfile` and exposes only the gateway port. Production
routing is maintained in `proj-airi/airi-railway/caddy`.

## Migration ownership

Both applications currently share one PostgreSQL database. The existing
`@proj-airi/server-schema` one-shot history remains the sole migration owner so
two Drizzle journals cannot race or disagree about cross-schema ordering.
Auth-server startup only checks that its `user` table is ready.

A future separate auth database should first introduce a dedicated migration
job and remove the remaining API authorization projection read; it is not
required for the current code/runtime extraction.
