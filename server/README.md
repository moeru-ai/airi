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
repository. Keep each service's **Root Directory** at the repository root.
Both Dockerfiles copy workspace manifests and shared packages from that build
context. The project-level Railway configuration lives in
`proj-airi/airi-railway/.railway/railway.ts`.

| Service | Public role | Private dependency |
| --- | --- | --- |
| Resource API | Product and resource API | Auth issuer and JWKS |
| Auth | Better Auth and OIDC issuer | Resource API deletion endpoint |

The Infrastructure as Code file pins each Dockerfile, start command,
`/readyz` healthcheck, and watch patterns. Run the Railway plan from the
deployment repository before you apply a change.

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

## Dev environment

The Railway `dev` environment is one shared slot. It has fixed public URLs, so
OAuth callbacks and payment webhooks stay registered when the code changes.

Work on your own branch in this repository. Do not merge into a shared test
branch. The `server-dev` branch is no longer a deploy source.

To test a branch, run the `Deploy to server-dev` workflow:

```sh
gh workflow run deploy-server-dev.yml -f branch=<branch> -f reset_database=true
```

Run the workflow from the default branch. The deploy job does not run from
another workflow ref.

The workflow does these steps in order:

1. It disables Railway autodeploys for both services.
2. It sets the Railway source branch for `ts-api` and `auth-server`.
3. It drains active deployments and removes running or sleeping deployments.
4. It resets the dev Neon branch to its parent branch, `production`.
5. It deploys the selected commit to each Railway service.
6. It drains any deployment that started before autodeploy was disabled.
7. It deploys both frontend jobs from the same selected commit.

The workflow stops before the reset if a Railway deployment needs approval.
After the reset, the API applies its migrations during startup.

Railway autodeploy stays disabled because a push can bypass the database reset
and deploy only one backend service. Run the workflow again with
`reset_database=false` to deploy a later commit from the same branch.

The branch must be in this repository. Railway cannot deploy a branch of a
fork.

The reset removes all data that the previous branch wrote. This includes dev
accounts that are not in production. Set
`reset_database=false` only when the database already has the migrations of
the branch and no others. The Drizzle migrator applies only migrations that are
newer than the last applied migration. If the database already has a newer
migration from a different branch, the migrator skips the older migrations of
the new branch and reports no error.

The reset does not clear Redis. Cached values from the previous branch can stay
until they expire.

The workflow needs this repository configuration:

| Name | Kind | Value |
| --- | --- | --- |
| `RAILWAY_DEV_WORKSPACE_TOKEN` | `ServerDev` environment secret | Railway workspace token with access to the `Server` project |
| `NEON_API_KEY` | Secret | Neon API key for the project that holds the dev database |
| `NEON_PROJECT_ID` | Variable | Neon project ID |
| `NEON_SERVER_DEV_BRANCH` | Variable | Name of the Neon branch that the dev `DATABASE_URL` points to |

The dev Neon branch is `serverlize-dev`. Its parent is `production`, so the
Neon API key can also read the production branch. Keep the key in the secret
only.

## Package boundaries

Frontend applications remain under `apps/`. Hosted-backend packages that
define a resource API protocol can live under `server/packages/`, even when a
frontend consumes their generated contract.

Cross-runtime server SDK and protocol packages remain under `packages/`
because Web, Electron, plugins, and independent services consume them.

Production Caddy routing, OpenTelemetry Collector configuration, observability
storage, and Grafana dashboards live in `proj-airi/airi-railway` so deployment
topology is not duplicated in the application repository.
