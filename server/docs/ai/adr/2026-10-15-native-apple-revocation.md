# Native Apple authorization for account deletion

Status: proposed

## Decision and scope

Native Apple sign-in exchanges the authorization code on the server before it creates a session.
The server verifies both Apple ID tokens and requires the same subject and audience.
The native ID token must contain SHA-256 of the raw nonce sent by the app.
The exchanged ID token may omit nonce; when present, it must match the native token.
Better Auth receives the verified native token and raw nonce for its own provider checks.
It stores the returned refresh token and ID token on the existing Better Auth account.
Revocation uses the stored ID token audience as the client ID, restricted to configured Apple identifiers.
Existing web grants without an ID token continue to use the configured web client ID.

An authenticated repair endpoint accepts new Apple authorization for an already linked Apple subject only.
It neither links another account nor creates a user. It returns a fresh session after token storage succeeds.
This supports existing accounts without saved tokens. Deletion still requires a separate explicit confirmation and a fresh session.
Missing Apple tokens return `APPLE_REAUTHENTICATION_REQUIRED` before sending deletion mail or revoking any provider.
Provider failures retain the user and allow retry. Credentials never appear in logs or client responses.

Non-goals: database migrations, changes to other providers, automatic deletion after authorization, and weaker session checks.

## Failure boundaries and limits

Invalid identity proofs return 401; rejected authorization codes return 400.
Provider network failures and missing server credentials return 503; unsuccessful or malformed exchange responses return 502.
No provider response bodies or credentials are exposed. Existing sessions survive repair failures.
If token storage fails after first sign-in, the new session is removed, but the user/account and creation-hook effects remain. The user can retry.
Each linked Apple account stores one grant. A later web/native or different-bundle authorization can overwrite its tokens; earlier grants cannot all be revoked with this schema.

## Dependencies and affected files

```mermaid
flowchart LR
  iOS --> NativeApplePlugin
  NativeApplePlugin --> AppleTokenEndpoint
  NativeApplePlugin --> BetterAuth
  NativeApplePlugin --> AccountStore
  Revoker --> AccountStore
  Revoker --> AppleRevocationEndpoint
```

```text
server/apps/auth/src/
  plugins/apple-native.ts
  auth.ts
  social-authorization.ts
  tests/apple-native.test.ts
  tests/social-authorization.test.ts
```

```mermaid
sequenceDiagram
  participant App
  participant Auth
  participant Apple
  App->>Auth: Delete with explicit confirmation
  Auth-->>App: Apple authorization required
  App->>Apple: Native authorization with nonce
  Apple-->>App: ID token and authorization code
  App->>Auth: Repair linked Apple authorization
  Auth->>Apple: Exchange code and verify identity
  Auth->>Auth: Match linked subject, store tokens, create session
  Auth-->>App: Fresh session
  App->>App: Show deletion confirmation again
  App->>Auth: Confirm deletion
  Auth->>Apple: Revoke saved token with matching client ID
  Auth->>Auth: Clean resources, delete user and sessions
```

## Test plan

Exercise production handlers with signed fixture tokens and mocked Apple HTTP responses.
Cover new and existing accounts, nonce and subject mismatch, unsupported audiences, code rejection, unauthenticated repair,
foreign Apple accounts, token persistence, fresh sessions, missing-token errors, native revocation, and deletion retries.
Run Auth tests, TypeScript checks, and lint. Test the native request contract and account isolation with Swift fixtures.
Real Apple authorization and destructive acceptance require a designated test account after deployment.
