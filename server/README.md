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

Railway and the `Cloudflare Workers (server-dev)` workflow deploy from the
`server-dev` branch. Use that branch as a pointer to the ref under test. Do not
merge into it and do not open a pull request against it.

To deploy a ref, run the `Deploy to server-dev` workflow:

```sh
gh workflow run deploy-server-dev.yml -f ref=<branch> -f reset_database=true
```

`ref` accepts a branch, a tag, a commit SHA, or `refs/pull/<number>/head` for a
pull request from a fork. A pull request from a fork then runs with the dev
secrets, so read its diff first.

The workflow does these steps in order:

1. It resets the dev Neon branch to its parent branch.
2. It force-pushes the ref to `server-dev`.
3. Railway and Cloudflare deploy the new commit. The API applies its migrations
   to the reset database on startup.

The reset removes all data that the previous ref wrote. Set
`reset_database=false` only when the two refs have the same migrations. The
Drizzle migrator applies only migrations that are newer than the last applied
migration. If the database already has a newer migration from a different ref,
the migrator skips the older migrations of the new ref and reports no error.

The reset does not clear Redis. Cached values from the previous ref can stay
until they expire.

The workflow needs this repository configuration:

| Name | Kind | Value |
| --- | --- | --- |
| `SERVER_DEV_PUSH_TOKEN` | Secret | Token with `contents: write` and `workflows: write` on this repository |
| `NEON_API_KEY` | Secret | Neon API key for the project that holds the dev database |
| `NEON_PROJECT_ID` | Variable | Neon project ID |
| `NEON_SERVER_DEV_BRANCH` | Variable | Name of the Neon branch that the dev `DATABASE_URL` points to |

The dev Neon branch must be a child branch. Keep its parent at the `main`
schema, and keep the shared test accounts in the parent.

## Package boundaries

Frontend applications remain under `apps/`. Hosted-backend packages that
define a resource API protocol can live under `server/packages/`, even when a
frontend consumes their generated contract.

Cross-runtime server SDK and protocol packages remain under `packages/`
because Web, Electron, plugins, and independent services consume them.

Production Caddy routing, OpenTelemetry Collector configuration, observability
storage, and Grafana dashboards live in `proj-airi/airi-railway` so deployment
topology is not duplicated in the application repository.
