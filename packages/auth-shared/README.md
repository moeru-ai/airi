# `@proj-airi/auth-shared`

Neutral authentication contracts shared by the resource API and the standalone auth service.

## Use it for

- The Better Auth-owned PostgreSQL schema.
- The authenticated principal/session shape exchanged inside server code.
- Authorization policy that must remain identical in both processes, such as ban expiry handling.

## Do not use it for

- Better Auth runtime construction or HTTP routes.
- Service environment parsing, database pools, Redis, email, or telemetry.
- Importing either `apps/server` or `apps/auth-server`.

Keeping this package free of runtime composition lets both applications depend on the same protocol without depending on each other.
