---
name: server-gateway-refactor
description: Use when refactoring AIRI apps/server routes that mix Hono route wiring, business operation orchestration, external gateway calls, billing, rate limiting, telemetry, or websocket session state. Applies especially to OpenAI-compatible, speech, Stripe, and websocket gateway surfaces.
---

# Server Gateway Refactor

Use this skill when an `apps/server` route file has grown into a mixed transport/business/infra module and the user wants it engineered rather than merely split by line count.

## First Read

Start from the exact route file the user named. Read nearby tests and domain services before editing. Use `rg` for call sites and avoid deleting legacy routes without checking tests/docs/env references.

Look for these responsibilities:

- HTTP/WebSocket transport shape: Hono routes, auth, request parsing, response mounting, upgrade setup.
- Gateway operation shape: authenticated user, parsed body/query, operation id, model/provider routing, external calls.
- Infra behavior: billing, rate limiting, telemetry/tracing, request logs, PostHog, retries, cache.
- Domain services: persistence, Stripe records, character/provider ownership, chat messages, flux transactions.

## Boundary Rules

- Keep Hono middleware as Hono middleware only when it can run from raw `Context`: auth, config availability, static files, IP-level limits.
- Use gateway middleware when the decision needs parsed gateway context: user id, operation id, request body, requested model, resolved model, streaming lifecycle, usage, or billing state.
- Prefer route-group scoped middleware for endpoint-specific behavior:
  - Good: `gateway.route('openai').use('chat.completions', rateLimit).post(...)`
  - Avoid: global gateway `.use('chat.completions', ...)` when the middleware is only meaningful for one endpoint group.
- Do not create handler files that only pass through parse + operation. Inline thin adapters in the route index unless they hide meaningful protocol decisions.
- Do not split by execution order alone. A module boundary should own a policy, operation, middleware, or external boundary.

## Naming

- File names use kebab-case, not camelCase.
- Use HTTP names for transport files and operation names for business files.
- Prefer `middlewares/` for both Hono and gateway middleware in this project when they are part of a route gateway surface.
- Prefer `operations/<operation>/index.ts` for reusable operation orchestration.
- Avoid `gateway` as a domain name unless the module really owns route/runtime composition.

## Preferred Shape

For gateway-like HTTP surfaces:

```ts
const gateway = createXGateway(deps)
  .useHono('*', '*', authGuard)
  .useHono('surface', '/path/*', configGuard(...))

const surfaceRoutes = gateway.route('surface')
  .use('operation.id', operationMiddleware(...))
  .post('/path', surface.handler(
    'operation.id',
    async (c) => parseInput(c),
    operation(deps),
  ))
  .route
```

Keep route index readable:

- It should show route groups, endpoint paths, and endpoint-scoped middleware.
- It may inline small parse adapters.
- It should not contain long external-provider workflows, webhook switches, or billing settlement logic.

## Candidate Signals

Use this pattern when:

- One route file exceeds roughly 200-300 lines and mixes route wiring with external provider orchestration.
- There are endpoint-specific middleware needs that cannot be represented as Hono middleware.
- Tests describe operation behavior more than route matching.
- The route has multiple business operations under one transport surface.

Do not force this pattern when:

- A CRUD route is already thin and delegates to a domain service.
- The route mostly mounts framework-owned handlers, static assets, or metadata endpoints.
- The logic belongs in an existing domain service instead of a new route gateway.

## Verification

After changes, run targeted validation before broader checks:

```sh
pnpm exec vitest run apps/server/src/routes/<route>/route.test.ts
pnpm -F @proj-airi/server typecheck
pnpm exec eslint <changed files>
```

If full `pnpm lint` fails from unrelated repo-wide issues, report that separately and keep targeted lint evidence.
