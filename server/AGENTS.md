# Server Guide

## Runtime contracts

- Use Valibot for all server data that crosses a trust boundary.
- This includes HTTP data, Pub/Sub messages, queue jobs, WebSocket events, database JSON, and provider responses.
- Define each schema beside the contract owner.
- Use `parse` if the caller converts invalid data into an error.
- Use `safeParse` if the caller branches on valid and invalid data.
- Do not use `typeof`, `Record<string, unknown>`, or type casts as runtime input validation.
- Infer TypeScript types from Valibot schemas. Do not duplicate the contract in an interface.

## HTTP responses

These rules apply to new routes. `server/docs/ai/adr/2026-10-19-http-response-conventions.md` lists the exceptions and the deployed routes that break them.

- Return a success resource directly. Do not wrap it in an envelope.
- Return `201` and the resource after a create. Return `204` with no body after a delete.
- Return a list as `{ records }`. Do not return a bare array.
- For a paginated list, read `limit` and `offset` with `LimitOffsetPaginationQuerySchema`. Return `{ records, hasMore }`.
- Throw an `ApiError` from `@proj-airi/http-error-shared`. Do not write an error body in a route or middleware.
- Name each error code in `UPPER_SNAKE`, for example `SUBSCRIPTION_ACTIVE`.
- Before you change a deployed response shape, find each client that reads it. Do not return two shapes.

## Architecture decisions

- Put server ADRs in `server/docs/ai/adr/`, relative to the repository root.
- Include ADRs in the related commits and pull requests in this repository.
- Create or update the ADR before you change a server boundary.
- A server boundary includes an HTTP contract, provider contract, persistence model, or cross-module lifecycle.
- Add a module dependency graph, an affected-file tree, and a sequence diagram to every implementation ADR.
- State the decision, scope, non-goals, and test plan in the ADR.
- Keep the ADR status `accepted` only after the decision is confirmed.
- Update the ADR when implementation changes the accepted design.
