# AIRI Backend

Project AIRI's hosted backend source lives under this folder. Workspace package
names stay stable; the directory groups service source and database ownership
while production deployment configuration remains in `proj-airi/airi-railway`.

## Layout

- `apps/api`: resource API, business domains, database migrations, and API runtime.
- `apps/auth`: standalone Better Auth and OIDC service.
- `packages/auth-shared`: Auth-owned database schema and principal contracts.
- `packages/server-sdk-shared`: Eventa contracts for the hosted chat WebSocket.
- `dev/caddy`: local-only public edge routing for the shared Auth/API origin.
- `docker-compose.yaml`: complete local API + Auth + PostgreSQL + Redis + Caddy stack.

## Run locally

From the repository root:

```sh
pnpm dev:backend
```

The command uses `server/docker-compose.yaml` and exposes only Caddy at
`http://localhost:6112`.

## Railway deployment

API and Auth are separate long-running Railway services built from the same
repository. Keep each service's **Root Directory** at the repository root:
both Dockerfiles copy workspace manifests and shared packages from that build
context. In each Railway service, configure the Config File Path explicitly:

| Service | Config File Path | Public role | Private dependency |
| --- | --- | --- | --- |
| Resource API | `/server/apps/api/railway.toml` | Product and resource API | Auth issuer and JWKS |
| Auth | `/server/apps/auth/railway.toml` | Better Auth and OIDC issuer | Resource API deletion endpoint |

Each config pins its own Dockerfile, start command, `/readyz` healthcheck, and
watch patterns. A change only deploys a service when it changes that service,
one of its copied shared packages, or a copied root build input.

### Service-to-service contract

Share database, Redis, and observability variables using Railway reference
variables rather than copying secret values between services. Configure the
two directional private links as follows:

| Consumer | Variable | Value source | Purpose |
| --- | --- | --- | --- |
| Resource API | `AUTH_SERVER_URL` | Auth's canonical public issuer URL | JWT issuer, audience, and public JWKS identity |
| Resource API | `AUTH_SERVER_INTERNAL_URL` | Auth's Railway private domain | Private JWKS fetch; it does not change issuer validation |
| Auth | `PUBLIC_URL` | Auth's canonical public issuer URL | Better Auth and OIDC issuer URL; must equal API `AUTH_SERVER_URL` |
| Auth | `RESOURCE_SERVER_URL` | API's Railway private domain | Private call before deleting a user's business data |

Set `RATE_LIMIT_TRUSTED_PROXY=railway` only for services directly receiving
Railway proxy traffic. Keep `/internal/*` private: Auth calls the API over its
private domain, and public routing must not expose the API's internal Auth
routes.

The API remains the shared database migration owner. Do not add a Railway
pre-deploy migration command to Auth, and do not make Auth startup run shared
migrations. After either service deploys, Railway must receive `200` from that
service's `/readyz`; deployment success alone is not sufficient evidence that
the service can reach its required dependencies.

## Package boundaries

Frontend applications remain under `apps/`. Hosted-backend packages that
define a resource API protocol can live under `server/packages/`, even when a
frontend consumes their generated contract.

Cross-runtime server SDK and protocol packages remain under `packages/`
because Web, Electron, plugins, and independent services consume them.

Production Caddy routing, OpenTelemetry Collector configuration, observability
storage, and Grafana dashboards live in `proj-airi/airi-railway` so deployment
topology is not duplicated in the application repository.
