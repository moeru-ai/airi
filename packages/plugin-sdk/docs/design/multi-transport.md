# Multi-Transport Plugin Contexts

- [Summary](#summary)
- [Background](#background)
- [Goals](#goals)
- [Non-goals](#non-goals)
- [Proposal](#proposal)
- [Design Detials](#design-detials)
  - [Context And Transport Model](#context-and-transport-model)
  - [Lifecycle Placement](#lifecycle-placement)
  - [Host Runtime Layout](#host-runtime-layout)
  - [API Binding Strategy](#api-binding-strategy)
  - [Local Vs Remote Plugins](#local-vs-remote-plugins)
  - [Multi-Plugin Isolation](#multi-plugin-isolation)
- [Verify & Test](#verify--test)
  - [Criteria](#criteria)
  - [Test & QA](#test--qa)
- [Progress](#progress)
  - [Status](#status)
  - [Next Steps](#next-steps)
- [Reviews](#reviews)
  - [Q&A](#qa)
  - [Related Documentations](#related-documentations)

## Summary

Introduce a host-side transport-aware context factory that provides one Eventa context per plugin instance. Plugin SDK APIs become context-bound factories, allowing local (in-memory/worker) and remote (WebSocket) plugins to share the same API surface while using different transports. This enables multiple plugins within a single Plugin Host without cross-talk or global channel coupling.

## Background

`plugin-sdk` currently exposes APIs (for example `providers.listProviders`) that call `defineInvoke` on a globally imported channel. This couples plugins to a single shared context and prevents the host from isolating multiple plugins or using different transports per plugin. We also need a path to support local plugins (in-process or worker) and remote plugins (WebSocket) with consistent ergonomics.

Eventa is context-oriented: contexts are created per transport (in-memory, WebSocket, worker, electron) and the invoke/handler APIs attach to that context. Multiple contexts can co-exist in the same process.

## Goals

- Provide one context per plugin instance, scoped by transport.
- Allow the same API surface to work for local and remote plugins.
- Keep transport selection under Plugin Host control, not plugin control.
- Support multiple plugins within one host without channel conflicts.
- Keep the API ergonomics for plugin authors simple and explicit.

## Non-goals

- Designing the full plugin lifecycle orchestration (phase transitions, capability config, etc.).
- Implementing a new transport stack beyond Eventa adapters (unless required by runtime gaps).
- Defining plugin packaging or distribution formats beyond `ManifestV1` entrypoints.

## Proposal

1. Introduce a host-side `createPluginContext(transport)` factory that returns an Eventa context bound to the plugin's transport.
2. Convert plugin SDK APIs to context-bound factories (`createApis(ctx)`), replacing global channel usage.
3. Resolve transport per plugin instance during host setup and pass the created context into plugin `init()`.
4. Add runtime-specific implementations under `plugin-host/runtimes/node` and `plugin-host/runtimes/web` to handle different transport adapters.
5. Optional: introduce shared reliable WebSocket helpers if needed, but prefer Eventa adapters first.

## Design Detials

Transport-aware contexts for isolated multi-plugin hosts.

### Context And Transport Model

Define a small transport config type owned by the Plugin Host:

```ts
export type PluginTransport
  = | { kind: 'in-memory' }
    | { kind: 'websocket', url: string, protocols?: string[] }
    | { kind: 'web-worker', worker: Worker }
    | { kind: 'node-worker', worker: import('node:worker_threads').Worker }
    | { kind: 'electron', target: 'main' | 'renderer', webContentsId?: number }
```

`createPluginContext(transport)` creates and returns an Eventa context based on the transport adapter (in-memory, WebSocket, worker, electron).

### Lifecycle Placement

Context creation happens during host setup, before any plugin lifecycle method is called.

1. Load plugin module (FileSystemLoader / UrlLoader).
2. Resolve transport for the plugin (manifest + host config).
3. Create context via `createPluginContext(transport)`.
4. Bind APIs with `createApis(ctx)`.
5. Call `plugin.init({ host: ctx, apis })`.

### Host Runtime Layout

- `packages/plugin-sdk/src/plugin-host/transports/`:
  - transport type definitions and helpers
- `packages/plugin-sdk/src/plugin-host/runtimes/node/`:
  - in-memory, node-worker, websocket implementations
- `packages/plugin-sdk/src/plugin-host/runtimes/web/`:
  - web-worker, websocket implementations
- `packages/plugin-sdk/src/plugin-host/index.ts`:
  - exports the runtime-appropriate `createPluginContext` via conditional exports

### API Binding Strategy

Replace direct channel usage with context-bound factories:

```ts
export function createProviders(ctx: EventaContext) {
  return {
    listProviders() {
      return defineInvoke(ctx, protocolListProviders)()
    },
  }
}

export function createApis(ctx: EventaContext) {
  return { providers: createProviders(ctx) }
}
```

Plugins call `createApis(ctx)` provided by the host instead of importing global singletons.

### Local Vs Remote Plugins

- Local plugins:
  - `in-memory` for simplest case
  - `node-worker` or `web-worker` for isolation
- Remote plugins:
  - `websocket` transport bound to a specific URL or connection

Transport selection is a host concern; plugins are transport-agnostic.

### Multi-Plugin Isolation

Each plugin has its own context and transport. APIs are bound to that context, preventing cross-talk. The host keeps a registry mapping plugin ID to its context, transport, and loaded module for lifecycle management.

## Verify & Test

### Criteria

- Multiple plugins can be loaded in one host without shared global channels.
- Local plugin calls use in-memory or worker contexts without manual wiring in plugin code.
- Remote plugin calls use WebSocket contexts and do not affect local plugins.
- Existing plugin tests can be updated to pass by injecting a context into APIs.

### Test & QA

- Unit test: create two plugin contexts in the same process, verify isolated invoke/handler pairs.
- Unit test: FileSystemLoader + in-memory context binds correctly to `createApis(ctx)`.
- Integration test (optional): WebSocket adapter roundtrip using a stub server.

## Progress

### Status

Planned.

### Next Steps

- Implement `createApis(ctx)` and migrate current API modules.
- Implement `createPluginContext` in node runtime (in-memory + websocket).
- Update tests to construct APIs with a provided context.

## Reviews

### Q&A

- Q: Why not keep global channels and just switch the active channel?
  A: Global channels make multi-plugin isolation impossible and require global state mutation. Context-per-plugin avoids cross-talk and matches Eventa's design.

- Q: Do plugins need to know about transports?
  A: No. The host injects the context and APIs; plugins remain transport-agnostic.

- Q: Should we build a shared reliable WebSocket package?
  A: Only if we need custom reconnection/heartbeat logic across multiple packages. Start with Eventa adapters; factor out shared logic later if required.

- Q: Can workers be used for plugin isolation?
  A: Yes. Use Eventa web-worker or node-worker adapters to bridge a per-plugin context to the worker.

### Related Documentations

- [Plugin Lifecycle](./plugin-lifecycle.md)
