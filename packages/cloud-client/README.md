# `@proj-airi/cloud-client`

The generated TypeScript client for the AIRI Cloud API.

## What it does

The package exports one function for each Cloud API operation, and the request and response types. Hey API generates all of the code in `src/generated`.

Cloud owns these domains:

- Public announcements: `GET /v1/announcements`. The call does not send credentials.
- Notifications: `/v1/inbox`. The interface calls the feature "Notifications". The API keeps the name `inbox`.
- Wallet reads: `/v1/wallet`.

## How to use it

Give the base URL and the request options in each call. The package has no global configuration.

```ts
import { inboxServiceGetInboxUnreadCount } from '@proj-airi/cloud-client'

const { data } = await inboxServiceGetInboxUnreadCount({
  baseUrl: import.meta.env.VITE_CLOUD_URL || 'https://cloud.airi.build',
  headers: { Authorization: `Bearer ${accessToken}` },
  throwOnError: true,
})
```

The generated types follow the OpenAPI document. They do not validate a response. Validate each response with Valibot where you use it.

## How to update it

The contract source is the Cloud protobuf API in `proj-airi/backend`. The backend generates OpenAPI through gRPC Gateway.

1. Copy `api/generated/openapiv2/cloud/cloud.swagger.yaml` from the backend to `openapi.yaml`.
2. Run `pnpm -F @proj-airi/cloud-client generate`.

Do not edit `src/generated` or `openapi.yaml` by hand.

## When not to use it

- For Auth calls, use the Auth client in `@proj-airi/stage-ui`.
- For calls to the TS resource API (`server/apps/api`), use its Hono client.
