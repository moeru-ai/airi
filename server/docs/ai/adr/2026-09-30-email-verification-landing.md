# Email verification landing

Status: accepted

## Decision and scope

Better Auth defaults registration and resend callbacks to `/`, which displays API JSON after verification.
Before email delivery, replace missing, empty, and root callbacks with `/auth/verify-email?verified=true` under `PUBLIC_URL`.
The existing Auth route redirects to the configured account UI. Explicit non-root callbacks remain unchanged.
The UI treats verification as successful only when no error is present, preventing false analytics and cross-tab notifications.
This default is supported policy. Tokens, sessions, database schema, and previously delivered emails remain unchanged.
Deploy Auth and the Auth UI to apply both fixes.

## Dependencies and affected files

```mermaid
flowchart LR
  Auth[auth.ts] --> Email[email.ts]
  Routes[routes.ts] --> UI[verify-email.vue]
```

Changed files: `server/apps/auth/src/auth.ts`, `apps/ui-server-auth/src/pages/verify-email.vue`,
`server/apps/auth/src/tests/email-verification.test.ts`, and this ADR.

## Verification flow

```mermaid
sequenceDiagram
  Client->>Auth: Register or resend
  Auth->>Mail: Verification link with result callback
  Browser->>Auth: Open verification link
  Auth->>Browser: Redirect with success or error query
  Browser->>UI: Follow existing Auth UI redirect
```

## Validation

Exercise registration, resend, successful verification, invalid tokens, and explicit callbacks through real Auth handlers with PGlite.
Run existing Auth and Auth UI tests, workspace typechecks, and repository lint.
The result page must suppress success analytics and broadcasts when `verified=true` accompanies an error.
