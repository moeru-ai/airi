# `@proj-airi/drizzle-migration`

Build-time package that compiles the SQL migrations from `server/apps/api/drizzle` into an importable module for the API runtime.

## Usage

The API imports the generated `migrations` value and applies it through the Drizzle browser migrator. Build the package from the repository root:

```sh
pnpm -F @proj-airi/drizzle-migration build
```

Use this package for API-owned Drizzle migration bundling. Runtime schemas remain in `server/apps/api/src/schemas`; shared browser or SDK contracts do not belong here.
