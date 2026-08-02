# `@proj-airi/server-schema`

Build-time package that bundles the SQL migration history owned by the AIRI
resource API.

## Use it for

- Packaging `server/apps/api/drizzle` as an importable migration bundle.
- Applying the shared PostgreSQL history once before API and Auth serve traffic.

## Do not use it for

- Defining Auth runtime behavior.
- Running migrations from every Auth replica.
- Business queries or database connection lifecycle.

The table definitions live in `server/apps/api/src/schemas` and
`server/packages/auth-shared`; this package only bundles their generated
migration history.
