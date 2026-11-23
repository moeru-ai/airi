# `@proj-airi/http-error-shared`

The HTTP error model and the typed success responses that the resource API and the auth service share.

## Use it for

- `ApiError` and its factory functions, for each error that a route, middleware, or service returns to a client.
- `createErrorHandler`, as the Hono `onError` handler of a service.
- `ok`, `created`, `noContent`, `list`, and `paginated`, for each success response of a route.

## Do not use it for

- Responses that another protocol owns: webhooks, Better Auth, OIDC metadata, the OpenAI gateway, and health probes.
- Provider-specific error bodies that a gateway route forwards.
- Importing `server/apps/api` or `server/apps/auth`.

## Error response

Each error response has this JSON body and the HTTP status of the error.

```json
{ "error": "BAD_REQUEST", "message": "Invalid auth event", "details": {} }
```

`details` is optional. Throw an `ApiError`. Do not write this body in a route or middleware.

## Success response

A success response has no envelope. Each function keeps the Hono response type, so `hc<AppType>` clients still infer each body.

| Function | Status | Body |
| --- | --- | --- |
| `ok(c, resource)` | `200` | The resource |
| `created(c, resource)` | `201` | The created resource |
| `noContent(c)` | `204` | None |
| `list(c, records)` | `200` | `{ records }` |
| `paginated(c, { records, hasMore })` | `200` | `{ records, hasMore }` |

`ok` and `created` reject an array at compile time.

```ts
import { created, list, noContent, ok } from '@proj-airi/http-error-shared'

new Hono<HonoEnv>()
  .get('/', async c => list(c, await service.list(c.get('user')!.id)))
  .get('/:id', async c => ok(c, await service.get(c.req.param('id'))))
  .post('/', async c => created(c, await service.create(await c.req.json())))
  .delete('/:id', async (c) => {
    await service.remove(c.req.param('id'))
    return noContent(c)
  })
```

ESLint forbids `c.json` in `server/apps/api/src` and `server/apps/auth/src`. A known deviation or a protocol-owned body disables the rule on its line and names the reason. `server/docs/ai/adr/2026-11-23-typed-success-responses.md` lists them.
