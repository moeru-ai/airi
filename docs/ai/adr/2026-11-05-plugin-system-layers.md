# Build the plugin system on injeca, eventa, and language-neutral contracts

Status: proposed

## Context

AIRI wants plugins in many languages: JavaScript in the Electron main process or a worker, and Go, Rust, Godot C#, or Unity C# in other processes. A plugin can export services, for example an LLM gateway, and depend on AIRI services, for example the config registry. A plugin can also start more services inside it at run time. An example is web search and web browse behind a Responses API.

The current plugin code has two paths:

- The WebSocket module channel (`plugin-protocol`, `server-runtime`, `server-sdk`). It connects outside processes, but it has no dependency management.
- The Extension Host (`plugin-sdk`). It has a Manifest, an Activation Planner, and Kit registration. It has four registries that manage registration, state, and withdrawal by hand. Phase 4 (the Kit Router) is not done.

injeca 0.3 adds lifecycle hooks in `build`, dependency awareness, run-time changes with automatic convergence, inversion of control, child containers, status propagation, decisions with requeue, and fallback dependencies. See `docs/design-0.3.md` in `moeru-ai/injeca`. eventa has implementations in JavaScript and C# (`moeru-ai/eventa.net`).

## Decision

### Layers

```text
            Plugin authors
┌──────────────────────────┐      ┌──────────────────────────┐
│ plugin-sdk (JS)          │      │ plugin-sdk (Go, Rust, C#) │
│ Manifest, Kits, provide  │      │ The same concepts         │
├──────────────────────────┤      ├──────────────────────────┤
│ injeca (full engine)     │      │ A small local runtime     │
│ graph, convergence,      │      │ for the dependencies in   │
│ status, decisions        │      │ the plugin                │
├──────────────────────────┤      ├──────────────────────────┤
│ injeca bridge (JS)       │ ◄──► │ bridge client             │
├──────────────────────────┤      ├──────────────────────────┤
│ eventa (JS)              │ ◄──► │ eventa (Go, Rust, C#)     │
└──────────────────────────┘      └──────────────────────────┘
      WebSocket, gRPC stream, stdio, MessagePort
```

- injeca is the runtime core of the plugin system. It owns dependency resolution, fallback, error handling, and state notification.
- plugin-sdk is the author layer. Each language has its own plugin-sdk. The SDKs are peers. One does not wrap another.
- eventa is the channel. It carries events, RPC, and streams between languages.

### Shared contracts

The SDKs share contracts, not code:

| Contract | Content | Owner |
| --- | --- | --- |
| eventa wire format | Events, RPC, and streams on the wire | eventa |
| Bridge protocol | Handshake and protocol version, exports (announce, withdraw, replace with `instanceId`), imports, status with a cause chain, heartbeat | The injeca bridge package, in the `moeru-ai/injeca` monorepo |
| Kit contracts | The methods, events, and types of each capability. One source generates the types for each language. | plugin-sdk and each Kit package |
| Manifest | Plugin id, version, entry points, runtime kind, permissions, exported and imported Kits | plugin-sdk |

A conformance test suite checks that each SDK follows the injeca rules for phases, status, and decisions.

### Graph ownership

- The host injeca resolves each dependency that crosses a process boundary. It is the only graph for these edges.
- A plugin runtime manages the dependencies inside the plugin. It reports the effective status of each export, with a cause chain.
- A non-JS SDK does not port the full injeca engine. It computes the effective status of its exports correctly, and it follows the bridge protocol.

### Connection flow

1. AIRI reads and validates the Manifest. It creates a child container. The owner is the plugin.
2. AIRI opens the channel that the Manifest names: it starts a process, or connects through WebSocket or gRPC. The channel is a service in the child container.
3. The two sides exchange the protocol version, the plugin id, and the capabilities.
4. The plugin announces its exports and imports. The bridge publishes one proxy service for each export and one invocation for each import, in one transaction.
5. injeca converges. Host services that depend on the exports build.
6. At run time, calls use RPC clients that the Kit contracts generate. Events and streams use eventa. Status reports go to `setStatus` on the proxy, and the effective status goes up the graph.
7. To uninstall, AIRI disposes the child container. Dependents stop first.

### Failure propagation

- A dependency inside the plugin fails, for example its log store. The plugin reports its export as `unavailable` with the cause. The proxy status changes. Host services that require it become `unavailable`, for example voice and the character. They do not stop or rebuild.
- The channel disconnects. The channel service becomes `unavailable`, and so does each proxy. After a reconnect, the plugin reports its instances again. The same `instanceId` means no rebuild. A new `instanceId` means a restart, and dependents get `dependency-change`.
- A consumer that has a fallback uses `firstAvailable(remoteKey, localKey)`. It moves to the local provider while the remote one is unavailable.

## Consequences

- Plugins in every language use the same dependency, status, and failure rules.
- The Extension Host can replace its four registries and the Activation Planner with injeca.
- The WebSocket module channel becomes one transport of the bridge, not a separate plugin path.
- Each new language needs an eventa implementation, a bridge client, a Kit type generator, and the conformance tests.
- The bridge protocol is a public contract. Changes to it need a protocol version.

## Relation to other ADRs

| ADR | Relation |
| --- | --- |
| [Agent harness](./2026-10-29-agent-harness.md) | The harness capabilities use this plugin system. The host capability states gain `unavailable`. |
| [Agent capability policy](./2026-10-13-agent-capability-policy.md) | Permissions on Kits stay in plugin-sdk, above injeca. |
| [Hosted Kit registration](./2026-09-22-hosted-kit-registration.md) | Its registration rules move to injeca registrations and transactions. |

## Out of scope

- The bridge protocol messages in detail. The bridge design document defines them.
- The Kit type generator.
- Sandboxing of plugin processes.

## Open questions

- Which source format defines the Kit contracts: Valibot with JSON Schema export, or a separate IDL?
- How does the host authenticate a plugin process on the channel?

## Follow-up

- Release injeca 0.3.
- Write the bridge design document and the bridge package.
- Explain the removal of the Activation Planner in issue #2507.
- Migrate plugin-sdk registrations to injeca.
