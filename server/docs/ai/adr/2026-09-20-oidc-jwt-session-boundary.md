# OIDC JWT identity at the Better Auth boundary

Status: accepted

## Context

The Auth service issues OIDC access tokens for AIRI clients. These clients also
call Better Auth profile and account endpoints with the access token.

Better Auth session middleware accepts its session cookie format. It does not
accept the asymmetric JWT access tokens from the OAuth Provider plugin.

The existing bridge verifies each JWT and creates a database Session. It then
injects the new Session token as a request cookie. Client session polling can
therefore create one database row per request. PostgreSQL does not remove rows
when `expires_at` passes.

The custom `/get-session` and `/list-sessions` routes also call Better Auth
before their direct JWT verifier. This order invokes the bridge on the hottest
authentication path. Their verifier also fetches this service's public JWKS
endpoint over loopback HTTP.

## Decision

Use one local access-token verifier for Auth routes and the Better Auth plugin.
The verifier loads JWKS data in-process and caches the key set for 60 seconds.
It validates the verified JWT claims with Valibot.

Apply the change in two stacked pull requests:

1. The custom token routes validate the JWT before Better Auth session lookup.
2. The plugin supplies verified identity through the request context. It does
   not create a Session row.

The final plugin treats the JWT as the credential for ordinary operations. If
the token contains an active original `sid`, the plugin supplies that Session
token to Better Auth's authoritative middleware. Sensitive and fresh-session
operations require this active Session.

The OAuth Provider includes `sid` in access tokens created from an active login
Session. A refreshed token can omit `sid` after that Session expires or is
deleted. Such a token remains valid for ordinary operations until `exp`, but it
cannot authorize a sensitive operation.

## Explicit sign-out

Update of 2026-11-11. A refresh token stays valid when its Session expires.
An explicit sign-out revokes it.

The OAuth Provider keeps a refresh token after `/oauth2/end-session` deletes
its Session. The refresh grant does not check the Session. Sign-out therefore
did not stop a copied refresh token.

- The stage client sends the refresh token to `/api/auth/oauth2/revoke`
  (RFC 7009) with `token_type_hint=refresh_token` and its public `client_id`.
  Then it ends the Session as before.
- The client logs a failed revoke or sign-out response. It clears local
  credentials in all cases.
- The custom `/api/auth/sign-out` route is gone. It answered success and
  skipped Better Auth. Better Auth's `/sign-out` now deletes the cookie Session
  and expires its cookies.
- A Bearer request to `/sign-out` with an active `sid` deletes that Session.
  Without an active `sid`, it answers success and deletes nothing.

```mermaid
sequenceDiagram
  participant C as Stage client
  participant P as OAuth Provider
  participant B as Better Auth
  C->>P: POST /oauth2/revoke (refresh token, client_id)
  P-->>C: 200
  alt ID token present
    C->>P: GET /oauth2/end-session (id_token_hint)
  else access token only
    C->>B: POST /sign-out (Bearer)
  end
  C->>C: Clear local credentials
```

## Scope

- Auth service OIDC access-token validation
- Custom Auth token routes
- Better Auth request identity
- Better Auth sensitive-session behavior
- Account-ban checks for JWT callers
- Refresh-token revocation on explicit sign-out

## Non-goals

- Delete historical expired Session rows
- Change access-token or refresh-token lifetimes
- Change OAuth Provider database tables
- Revoke refresh tokens when a Session only expires
- Replace Better Auth or its OAuth Provider plugin
- Change resource API authentication

## Consequences

- Normal JWT requests do not create Session rows.
- JWT verification does not call the service over loopback HTTP.
- Key rotation reaches each verifier within 60 seconds.
- Ordinary JWT requests still load the current user for deletion and ban state.
- Sensitive operations retain Session revocation and freshness checks.
- Existing expired rows require a separate production cleanup plan.

## Module dependencies

```mermaid
flowchart LR
  Client[AIRI client] --> Routes[Auth token routes]
  Client --> BetterAuth[Better Auth endpoint]
  Routes --> Verifier[OIDC access-token verifier]
  BetterAuth --> Plugin[OIDC JWT plugin]
  Plugin --> Verifier
  Verifier --> JWKS[In-process JWKS loader]
  Client --> Revoke[OAuth Provider revoke endpoint]
  Routes --> User[User store]
  Plugin --> User
  Plugin --> Session[Original Session lookup by sid]
```

## Affected files

```text
server/
  apps/auth/src/
    auth.ts
    oidc-access-token.ts
    routes.ts
    plugins/oidc-jwt-bearer.ts
    tests/
      oidc-jwt-bearer.test.ts
      routes-oidc-token-auth.test.ts
  docs/ai/adr/
    2026-09-20-oidc-jwt-session-boundary.md
packages/stage-ui/src/
  libs/auth-oidc.ts
  stores/
    auth.ts
    auth.browser.test.ts
```

## Request sequence

```mermaid
sequenceDiagram
  participant C as AIRI client
  participant A as Auth route or plugin
  participant V as Local verifier
  participant D as Auth database
  participant B as Better Auth middleware
  C->>A: Bearer access token
  A->>V: Verify signature and claims
  V->>D: Load JWKS on cache miss
  A->>D: Load current user
  alt ordinary operation
    A->>B: Request-scoped identity
    B-->>C: Response
  else sensitive operation with active sid
    A->>D: Load original Session
    A->>B: Signed original Session token
    B->>D: Read authoritative Session
    B-->>C: Response
  else sensitive operation without active sid
    B-->>C: Unauthorized or session-not-fresh response
  end
```

## Test plan

- Make sure that valid JWT routes do not call Better Auth session lookup.
- Make sure that invalid JWTs retain the Better Auth fallback.
- Make sure that invalid claims do not create request identity.
- Make sure that the plugin never calls `createSession`.
- Make sure that an active `sid` supplies the original Session cookie.
- Make sure that an expired `sid` cannot supply the Session cookie.
- Make sure that Better Auth session middleware accepts a JWT without an active
  `sid`. Run `/list-accounts` through Better Auth dispatch to check this.
- Make sure that banned users do not receive request identity.
- Make sure that `/api/auth/sign-out` reaches Better Auth.
- Make sure that a Bearer sign-out deletes the active `sid` Session, and
  answers success without one.
- Make sure that client sign-out revokes the refresh token before it ends the
  Session, and clears local credentials when the server rejects both calls.
- Run Auth tests, Auth typecheck, repository lint, and CI.
