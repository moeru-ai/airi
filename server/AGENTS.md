# Server Guide

## Runtime contracts

- Use Valibot for all server data that crosses a trust boundary.
- This includes HTTP data, Pub/Sub messages, queue jobs, WebSocket events, database JSON, and provider responses.
- Define each schema beside the contract owner.
- Use `parse` if the caller converts invalid data into an error.
- Use `safeParse` if the caller branches on valid and invalid data.
- Do not use `typeof`, `Record<string, unknown>`, or type casts as runtime input validation.
- Infer TypeScript types from Valibot schemas. Do not duplicate the contract in an interface.

## Architecture decisions

- Put server ADRs in `../airi-docs/adr/`.
- Create or update the ADR before you change a server boundary.
- A server boundary includes an HTTP contract, provider contract, persistence model, or cross-module lifecycle.
- Add a module dependency graph, an affected-file tree, and a sequence diagram to every implementation ADR.
- State the decision, scope, non-goals, and test plan in the ADR.
- Keep the ADR status `accepted` only after the decision is confirmed.
- Update the ADR when implementation changes the accepted design.
