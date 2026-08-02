# AIRI Backend

Project AIRI's hosted backend source lives under this folder. Workspace package
names stay stable; the directory groups service source and database ownership
while production deployment configuration remains in `proj-airi/airi-railway`.

## Layout

- `apps/api`: resource API, business domains, database migrations, and API runtime.
- `apps/auth`: standalone Better Auth and OIDC service.
- `packages/auth-shared`: Auth-owned database schema and principal contracts.
- `packages/schema`: bundled migration history consumed by the API migration owner.
- `packages/node-shared`: Node.js infrastructure policies shared by API and Auth.
- `dev/caddy`: local-only public edge routing for the shared Auth/API origin.
- `docker-compose.yaml`: complete local API + Auth + PostgreSQL + Redis + Caddy stack.

## Run locally

From the repository root:

```sh
pnpm dev:backend
```

The command uses `server/docker-compose.yaml` and exposes only Caddy at
`http://localhost:6112`.

## Not included

Frontend applications remain under `apps/`. Cross-runtime server SDK and
protocol packages remain under `packages/` because Web, Electron, plugins,
and independent services consume them.

Production Caddy routing, OpenTelemetry Collector configuration, observability
storage, and Grafana dashboards live in `proj-airi/airi-railway` so deployment
topology is not duplicated in the application repository.
