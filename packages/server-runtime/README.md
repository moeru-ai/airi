# Server runtime

This package routes AIRI protocol events between authenticated module peers.
Use it for a standalone channel server or an embedded desktop server. It does not own chat sessions or model execution.

## Usage

Create a server through `@proj-airi/server-runtime/server`, then call `start()` and `stop()` for its host lifecycle.
Use `setupApp` from the package root when an existing HTTP host owns the server lifecycle.

## Directed events

`output:gen-ai:chat:*` events require a nonempty `route.destinations` list. Missing targets never fall through to broadcast.
Devtools bypass cannot remove this requirement. Middleware target decisions cannot widen the explicit destination list.
Broadcast, consumer, and consumer-group delivery apply the same target restriction.
The server overwrites `metadata.sender` on every routed event. Its `peerId` is the physical source connection ID.
Reply routes use the `connection` expression. Module names, client aliases, and later source changes cannot redirect that connection address.
These transport rules do not authorize access to private session history.

## Module lifecycle

Module removal notifications come from server-owned disconnect and liveness cleanup.
Client-authored `extension:module:de-announced` events never enter peer routing, so a module cannot revoke another writer's observations.
The module list in `registry:modules:sync` carries each module's connection and `cognition` declaration. Client-authored module lists never enter peer routing.

## Validation

Run `pnpm -F @proj-airi/server-runtime typecheck` and `pnpm -F @proj-airi/server-runtime exec vitest run`.
