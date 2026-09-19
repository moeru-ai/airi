# Electron transcription CORS

Status: proposed

## Decision and scope

The packaged Electron renderer loads from `file://` and sends the opaque
`Origin: null` value. The API CORS middleware reflects that value only for the
authenticated realtime transcription route, `/api/v1/audio/transcriptions/stream`.
All other routes continue to use the existing trusted-origin allowlist.

This is a focused compatibility fix for desktop official transcription. It
does not trust `null` for redirect URL resolution and does not add a wildcard
origin policy.

## Module dependencies

```mermaid
flowchart LR
  Electron[Packaged renderer file://] -->|Origin: null| Cors[API CORS middleware]
  Cors --> Origin[getTrustedCorsOrigin]
  Origin -->|exact transcription path| Stream[Authenticated transcription route]
  Origin -->|all other paths| Allowlist[Existing trusted-origin policy]
```

## Affected files

```text
server/
  apps/api/src/app.ts
  apps/api/src/utils/origin.ts
  apps/api/src/utils/tests/origin.test.ts
  docs/ai/adr/2026-09-18-electron-transcription-cors.md
```

## Request lifecycle

```mermaid
sequenceDiagram
  participant E as Electron renderer
  participant C as CORS middleware
  participant O as Origin policy
  participant S as Transcription route
  E->>C: OPTIONS with Origin: null
  C->>O: origin + request path
  O-->>C: null for exact transcription path
  C-->>E: 204 with Access-Control-Allow-Origin: null
  E->>S: Authenticated streaming POST
  S-->>E: transcription stream or HTTP error
```

## Non-goals

- Do not accept `null` for chat, billing, auth, or redirect origin handling.
- Do not replace the route with an Electron main-process proxy in this change.
- Do not use `*` with credentialed requests.

## Verification

The origin unit tests verify the exact path restriction and exercise Hono's
actual preflight middleware. The transcription route's existing Bearer-token
authentication remains the authorization boundary. Full API typecheck and
repository CI remain upstream checks when optional workspace dependencies are
available.
