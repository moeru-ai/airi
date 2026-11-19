# AIRI Auth Server

Standalone authentication and identity application for Project AIRI.

## Responsibilities

- Better Auth session, social login, magic-link, password, and OIDC flows.
- `/api/auth/*`, `/auth/*`, and authentication discovery endpoints.
- Auth-owned Redis configuration, transactional email, and auth telemetry.
- Calling the resource API over the deployment's private network before deleting business data.

## Code layout

The runtime is intentionally flat. Its main boundaries are:

- `auth.ts`: Better Auth configuration and identity lifecycle hooks.
- `routes.ts`: the complete public Auth HTTP surface and request authentication.
- `server.ts`: dependency composition, health checks, and process lifecycle.
- `resource-api.ts`: the single private Auth-to-resource-API boundary.
- `rate-limit.ts` and `otel.ts`: cross-route operational policies.
- `email.ts` and `oidc-jwt-bearer.ts`: substantial external integration modules.

Small shared contracts stay beside those boundaries (`db.ts`, `env.ts`,
`error.ts`, and `origin.ts`). Tests are collected under `src/tests`; Better
Auth schema-generation wiring is isolated under `src/tooling`.

## Account deletion

`POST /api/auth/delete-account` accepts `{ "confirm": true }` after the client confirms permanent deletion.
It requires an authoritative session created within the last five minutes and returns `{ "success": true, "message": "User deleted" }` without email confirmation.
On `SESSION_NOT_FRESH`, the client must request sign-in again.
The existing `/api/auth/delete-user` email flow is unchanged. See [deletion policy and rollout](../../docs/ai/adr/2026-10-10-account-deletion-confirmation.md).

## Run locally

```bash
pnpm -F @proj-airi/auth-server dev
```

The service reads `.env.local` from this directory. `PUBLIC_URL` is the public issuer origin presented through Caddy; `RESOURCE_SERVER_URL` is the private resource API used for internal calls.

To run PostgreSQL, Redis, the resource API, and Auth together from the repository root:

```bash
pnpm dev:backend
```

`server/docker-compose.yaml` exposes only the local Caddy gateway on `http://localhost:6112`; API and Auth
stay on its private network. The internal `/internal/*` boundary has no
application token, and Caddy rejects that path at the public edge.

## Native Google sign-in

Set `AUTH_GOOGLE_NATIVE_CLIENT_IDS` to a comma-separated list of additional Google OAuth client IDs.
For Android Credential Manager, include the Web client ID passed as `serverClientId`.

- For the standalone Auth process, set the variable in `server/apps/auth/.env.local`.
- For `pnpm dev:backend`, set it in `server/apps/api/.env.local`.
  Compose loads `server/apps/api/.env` and `.env.local` into the Auth container, in that order.
  It does not load `server/apps/auth/.env.local`.
  Run `pnpm dev:backend` again after edits so Compose recreates the container with the updated values.
- For Railway, set it in the Auth service variables for the target environment.

```dotenv
AUTH_GOOGLE_NATIVE_CLIENT_IDS=123456789-native.apps.googleusercontent.com
```

The original `AUTH_GOOGLE_CLIENT_ID` stays first in the provider configuration.
Browser authorization still uses that client and `AUTH_GOOGLE_CLIENT_SECRET`.
Native ID tokens can use any configured audience. Better Auth checks the token signature, issuer, expiry, and supplied nonce.
Omit the new variable to keep the existing configuration. No database migration is required.

Google ID token sign-in can create an account without a Google access or refresh token.
Account deletion continues when neither token is stored, because AIRI has no Google API credential to revoke.
This does not revoke consent in the user's Google Account.
If either token is stored, Auth must complete its existing revocation policy before it deletes AIRI data.

## Railway

Deploy this as the Auth Railway service. Keep the service Root Directory at
the repository root because the Dockerfile copies workspace manifests and
`server/packages/auth-shared`. The project-level Infrastructure as Code file
is `proj-airi/airi-railway/.railway/railway.ts`. It owns the Dockerfile, start
command, `/readyz` healthcheck, and watch patterns.

Set `PUBLIC_URL` to this service's canonical public issuer URL, and make the
Resource API's `AUTH_SERVER_URL` exactly the same value. Set
`RESOURCE_SERVER_URL` from the Resource API's Railway private domain; do not
run shared database migrations from Auth. See
[`server/README.md`](../../README.md#railway-deployment) for the complete
service contract.

### Rotate `BETTER_AUTH_SECRET`

Better Auth uses the secret in two ways:

- It signs session cookies, bearer session tokens, OAuth state, and email verification tokens with the current secret only.
- It encrypts the JWKS private keys in `jwks.private_key`. OIDC access tokens are signed with these keys.

A rotation signs out every cookie and bearer session, and it invalidates unused verification links. OIDC refresh tokens stay valid.

Do not only replace `BETTER_AUTH_SECRET`. Then Better Auth cannot decrypt the JWKS private keys, and OIDC sign-in fails. Use `BETTER_AUTH_SECRETS` instead. It holds `<version>:<secret>` pairs, and the first pair is the current secret.

Better Auth reads `BETTER_AUTH_SECRETS` from the environment itself, so a rotation needs no code.

Steps:

1. Generate a secret: `openssl rand -base64 32`.
2. Set `BETTER_AUTH_SECRETS=2:<new secret>`. Keep the old value in `BETTER_AUTH_SECRET`, so Better Auth can still read the current JWKS keys. Deploy.
3. Expire the current JWKS keys: `UPDATE jwks SET expires_at = now() WHERE expires_at IS NULL OR expires_at > now();`
4. Sign in once. The jwt plugin signs with the newest key only. The newest key is expired, so the plugin creates a key under the new secret.
5. Give the old keys one more hour: `UPDATE jwks SET expires_at = now() + interval '1 hour' WHERE id IN (<old key ids>);`. The plugin still signs with the new key, because it picks the newest key by creation time. The Auth service's own JWT check (`oidc-jwt-bearer.ts`) skips expired keys, so without this step it rejects access tokens that the old keys signed.
6. Set `BETTER_AUTH_SECRET` to the new secret and deploy. No stored value needs the old secret now.
7. After the hour, delete the old keys. Access tokens live one hour, so no valid token uses them.

The JWKS endpoint keeps expired keys for 30 days. Until step 7, someone with the old secret and database access can still read the old private keys.

Keep `BETTER_AUTH_SECRETS` after the rotation. New keys use its versioned format, and Better Auth reads that format only when `BETTER_AUTH_SECRETS` is set. For the next rotation, put the new pair first, for example `3:<newer secret>,2:<new secret>`.

## Do not use it for

- Product APIs, billing, model routing, chat, or WebSocket business state.
- Importing modules from `server/apps/api`.
- Running the shared database migration history during normal process startup.

Auth tables and principal contracts live in `@proj-airi/auth-shared`. Drizzle reads shared migration files during API startup. The API remains the migration owner.
