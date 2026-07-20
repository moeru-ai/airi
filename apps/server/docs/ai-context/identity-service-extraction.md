# Identity Service Extraction

The public authentication origin remains `api.airi.build`. Caddy routes the
authentication path set to a private Identity service, while all other API
traffic continues to the resource API. The account UI remains at
`accounts.airi.build`.

## Target boundary

```text
accounts.airi.build                         -> account/login UI
api.airi.build/api/auth/*                   -> Caddy -> private Identity service
api.airi.build/auth/*                       -> Caddy -> private Identity service
api.airi.build/.well-known/oauth-.../api/auth -> Caddy -> private Identity service
api.airi.build/*                            -> Caddy -> resource API
```

Identity and API initially share Postgres and Redis, but have separate
composition roots and environment schemas. The API does not instantiate
Better Auth and does not mount auth/OIDC routes.

## Runtime roles

```bash
pnpm -F @proj-airi/server start           # api
pnpm -F @proj-airi/server start:identity  # identity
```

The `identity` role exposes only:

- `/api/auth` and `/api/auth/*`
- `/auth` and `/auth/*`
- `/.well-known/oauth-authorization-server/api/auth`
- `/livez` and `/readyz`

Business routes such as `/api/v1/*`, Stripe webhooks, admin routes, and
WebSockets are not mounted on the Identity surface.

The `api` role exposes no auth or discovery handlers. It validates OIDC access
tokens against `https://api.airi.build/api/auth/jwks`, checks
`iss=https://api.airi.build/api/auth`, checks `aud=https://api.airi.build`, and
reads the minimal user authorization row for ban and role enforcement.

## URL configuration

Both server roles use the public gateway URL as the protocol origin:

```dotenv
API_SERVER_URL=https://api.airi.build
IDENTITY_INTERNAL_SECRET=<same random value on API and Identity>
AUTH_UI_URL=https://accounts.airi.build/ui
```

Client builds need only:

```dotenv
VITE_SERVER_URL=https://api.airi.build
```

`API_SERVER_URL` is Better Auth's `baseURL`, the OIDC issuer, and the OAuth
resource/audience. The Identity process may listen on a private Railway host,
but that address must not appear in protocol metadata, redirects, or clients.

## Railway services and Caddy

Create an Identity service from the same repository and Dockerfile:

- Dockerfile: `apps/server/production/railway/Dockerfile`
- Start command: `pnpm -F @proj-airi/server start:identity`
- Healthcheck: `/readyz`
- Networking: Railway private domain only; no public domain is required

Identity needs the current `DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`,
social-provider credentials, and email configuration. It does not need Stripe
or LLM-router secrets. API does not need Better Auth or social-provider
credentials.

Configure the Caddy service with:

```dotenv
AIRI_IDENTITY_BACKEND_HOST=${{identity.RAILWAY_PRIVATE_DOMAIN}}
AIRI_IDENTITY_BACKEND_PORT=3000
```

Caddy must preserve the original host, scheme, path, query, method, and body
when routing the auth matcher. The matcher must run before the general Node API
catch-all.

Existing social-provider callbacks remain unchanged:

```text
https://api.airi.build/api/auth/callback/google
https://api.airi.build/api/auth/callback/github
```

## Cutover order

1. Create and verify the private Identity service through `/livez` and `/readyz`.
2. Set the shared `IDENTITY_INTERNAL_SECRET` on Identity and API.
3. Configure Caddy's Identity private host and port.
4. Verify discovery, JWKS, sign-in, refresh, logout, and callbacks through
   `https://api.airi.build` without changing client builds or provider callbacks.
5. Deploy the resource API role without auth routes and verify bearer-token
   validation through the same public issuer.

## Deliberately deferred

- A separate public Identity domain
- Separate Identity database
- Redis Streams, Outbox, or a workflow engine
- Asynchronous account deletion
- Moving the code into a separate workspace package

Account deletion remains synchronous. Better Auth calls the API's authenticated
`POST /internal/identity/user-deletion` endpoint before hard-deleting identity
rows. The API owns Stripe cancellation and business-record cleanup; Identity
does not import or initialize those services.
