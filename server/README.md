# AIRI server workspace

Backend deployables and backend-only packages live under this directory. Keeping them in one workspace makes the deployment boundary explicit while the repository root remains the shared pnpm workspace.

## Structure

- `apps/api`: Hono HTTP and WebSocket API, including auth, billing, chat synchronization, model gateway routing, and observability.
- `packages/drizzle-migration`: compiled Drizzle migrations consumed by the API at startup.
- `docker-compose.yml`: local API, PostgreSQL, and Redis stack.

Packages shared with browser, desktop, integrations, or plugins remain in the root `packages/` directory because they are not backend-only.

## Usage

From the repository root:

```sh
pnpm -F @proj-airi/api-server dev
pnpm -F @proj-airi/api-server typecheck
pnpm -F @proj-airi/api-server exec vitest run
pnpm -F @proj-airi/api-server build
pnpm dev:backend
```

Use the scoped package commands when PostgreSQL and Redis already exist. Use `pnpm dev:backend` to build and run the complete local Compose stack.

## Boundaries

Use `server/apps/api` for API-owned routes, services, schemas, and runtime composition. Use `server/packages` only for packages that are private to backend deployables. Cross-runtime contracts and SDKs belong in the root `packages/` workspace.
