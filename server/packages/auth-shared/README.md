# `@proj-airi/auth-shared`

Neutral authentication contracts shared by the resource API and the standalone auth service.

## Use it for

- The Better Auth-owned PostgreSQL schema.
- The authenticated principal/session shape exchanged inside server code.
- Authorization policy that must remain identical in both processes, such as ban expiry handling and the built-in trusted origin rules.
- The cross-origin policy, `resolveCrossOriginHeaders`. Each service applies it to `/api/*` with a small Hono middleware. See [the cross-origin ADR](../../docs/ai/adr/2026-11-07-cross-origin-boundary.md).
- `TRUSTED_ORIGINS`, the one redirect allowlist for OIDC redirect URIs, Better Auth `trustedOrigins`, and the Stripe return base. It does not decide CORS.

## Do not use it for

- Better Auth runtime construction or HTTP routes.
- Service environment parsing, database pools, Redis, email, or telemetry.
- Importing either `server/apps/api` or `server/apps/auth`.

Keeping this package free of runtime composition lets both applications depend on the same protocol without depending on each other.
