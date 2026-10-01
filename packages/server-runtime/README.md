# Server runtime

This package routes AIRI protocol events between authenticated module peers.
Use it for a standalone channel server or an embedded desktop server. It does not own chat sessions or model execution.

## Usage

Create a server through `@proj-airi/server-runtime/server`, then call `start()` and `stop()` for its host lifecycle.
Use `setupApp` from the package root when an existing HTTP host owns the server lifecycle.

## Directed events

`output:gen-ai:chat:*`, `context:source:request`, and `context:source:response` events require a nonempty `route.destinations` list. Missing targets never fall through to broadcast.
Devtools bypass cannot remove this requirement. Middleware target decisions cannot widen the explicit destination list.
Broadcast, consumer, and consumer-group delivery apply the same target restriction.
The server overwrites `metadata.originConnectionId` on every routed event with the physical source connection ID.
`module:authenticated.connectionId` gives each peer its own connection ID.
Reply routes use the `connection` expression. Module names, client aliases, and later source changes cannot redirect that connection address.
These transport rules do not assign audience labels or authorize access to private session history.

## Module lifecycle

Module removal notifications come from server-owned disconnect and liveness cleanup.
Client-authored `extension:module:de-announced` events never enter peer routing, so a module cannot revoke another writer's observations.

## Validation

Run `pnpm -F @proj-airi/server-runtime typecheck` and `pnpm -F @proj-airi/server-runtime exec vitest run`.
