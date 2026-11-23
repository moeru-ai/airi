# `@proj-airi/http-response-shared`

Typed JSON success responses that the resource API and the auth service share.

## Use it for

- Each success response of a route in `server/apps/api` or `server/apps/auth`.
- `ok` returns one resource with `200`. `created` returns the new resource with `201`.
- `noContent` returns `204` with no body after a delete.
- `list` returns `{ records }`. `paginated` returns `{ records, hasMore }`.

The functions keep the Hono response type, so `hc<AppType>` clients still infer each body.
`ok` and `created` reject an array at compile time.

## Do not use it for

- Error responses. Throw an `ApiError` from `@proj-airi/http-error-shared`.
- Responses that another protocol owns: webhooks, Better Auth, OIDC metadata, the OpenAI gateway, and health probes.
- Importing `server/apps/api` or `server/apps/auth`.

## Usage

```ts
import { created, list, noContent, ok } from '@proj-airi/http-response-shared'

new Hono<HonoEnv>()
  .get('/', async c => list(c, await service.list(c.get('user')!.id)))
  .get('/:id', async c => ok(c, await service.get(c.req.param('id'))))
  .post('/', async c => created(c, await service.create(await c.req.json())))
  .delete('/:id', async (c) => {
    await service.remove(c.req.param('id'))
    return noContent(c)
  })
```

ESLint forbids `c.json` in `server/apps/*/src`. A response that another protocol owns, or a deployed route in the known deviations of `server/docs/ai/adr/2026-10-19-http-response-conventions.md`, disables the rule on its line and names the reason.
