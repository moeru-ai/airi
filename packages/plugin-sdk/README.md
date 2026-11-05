# @proj-airi/plugin-sdk

Runtime-agnostic SDK for AIRI extensions.

## Extension Manifest

Each installable Extension package has an `extension.airi.json` file at its root. The current Host accepts only Manifest v2:

```json
{
  "manifestVersion": 2,
  "kind": "manifest.extension.airi.moeru.ai",
  "id": "example-extension",
  "version": "1.0.0",
  "engines": {
    "airi": "*",
    "runtimes": ["electron"]
  },
  "entrypoints": {
    "electron": "./extension.mjs"
  },
  "permissions": {},
  "kits": {
    "uses": [
      {
        "id": "dev.airi.example",
        "version": "^1.0.0",
        "optional": true
      }
    ]
  }
}
```

Manifest parsing is strict. Unknown fields, unsafe ids, empty entrypoints, and missing runtime entrypoints fail validation.

Kit Provider declarations use exact semantic versions. Kit Consumer declarations accept semantic version ranges.

Exact versions retain prerelease and build identifiers, such as `1.2.3-rc.1+build.007`. Provider declarations, Contracts, and matching Host sources require the same complete version.

## Extension-hosted Kit Registration

An Extension-hosted Kit has a shared Contract and a Provider implementation. The Manifest declares the Kit before the Extension runs. Root setup calls `ctx.kits.provide(...)` with the same ID, version, and exposure policy.

```ts
const statusKit = defineKitContract({
  id: 'dev.airi.example-status',
  version: '1.0.0',
  methods: { read: defineKitMethod<undefined, { status: string }>() },
  events: {},
  allowedExposePolicies: ['local-only'],
})

export default defineExtension({
  id: 'example-status-provider',
  setup(ctx) {
    ctx.kits.provide(statusKit, {
      methods: { read: () => ({ status: 'ready' }) },
    })
  },
})
```

The Host declares every provided Kit in an injeca transaction before setup starts. It publishes all of them only after setup succeeds. If setup fails, omits a declared Kit, or withdraws one before the commit, the Host aborts the transaction. A stale handle cannot withdraw the Kit of a newer session.

Stop disposes the session container. It aborts a setup that is in progress and does not wait for it. A stopped setup cannot provide Kits or register modules, and `start` rejects with `stopped before setup completed`.

Stop withdraws the provided Kits first, so consumers stop or move before the cleanup callbacks run. Cleanup attempts every module and root subscription even when a disposer fails. One failure keeps its identity. More failures use `AggregateError`. Concurrent stops share one result.

The Node entry of `@proj-airi/plugin-sdk/plugin-host` injects `AsyncLocalStorage` as the injeca async context. A cleanup that stops or reloads its own session then rejects with `reentrant-dispose`, also after `await`. A Web Host has no async context, so a configured stop timeout ends such a cleanup.

Only root setup can provide a Kit. Module scopes can consume Kits, but they cannot provide one.

Load the [registration example](../../apps/stage-tamagotchi/src/main/services/airi/plugins/examples/hosted-kit-provider/README.md) through the Extension Host Inspector.

The manifest owns the Extension version for the Host session. `defineExtension(...)` must use the same Extension id.

## Plugin Host on injeca

The Host is one injeca container. See [the ADR](../../docs/ai/adr/2026-11-06-plugin-host-on-injeca.md).

```text
plugin-host container
├─ kit:<id>@host          a Host Kit. Its value connects a client for each caller.
├─ kit:<id>#<range>       the selection of a Kit for one version range, perConsumer: one client for each consumer scope
├─ capability:<key>       a Host capability
└─ plugin container       one for each session, owner { kind: 'plugin', pluginId, sessionId }
   ├─ package, compat     Manifest and engine checks
   ├─ runtime             the plugin runtime from the runner (direct or worker)
   ├─ session             setup. It depends on runtime and on each used Kit.
   ├─ module:<id>         a dynamic module from ctx.modules.upsert()
   └─ kit:<id>@<plugin>   an exported proxy for each provided Kit
```

- A Kit has a provider key for each provider, so two providers of one Kit do not conflict. `kitProviderOrder` sets the order of the selection. The Host Kit comes first by default.
- Each version range in use has its own selection. It selects the first available provider with a version in the range.
- A consumer that is installed before its provider waits in `pending`. `session.explanation` tells why, for example `No provider of Kit airi.fs-store is installed.` It starts when the provider commits.
- `reload(id)` stops the old session, then starts a new one. `reload(id, { atomic: true })` starts the new session first, so the consumers of its Kits move without a gap.

### Typed Kit references

A plugin passes the contract or the Kit reference itself. The type follows the reference. A plugin never sees injeca keys or containers.

```ts
export default defineExtension({
  id: 'plugin-a',
  async setup(ctx) {
    const fsStore = ctx.kits.get(fsStoreKit) // a dependency from `kits.uses`
    const memory = ctx.kits.get(optional(autoMemoryKit)) // `undefined` when no provider runs
    const later = await ctx.kits.use(otherKit) // not a dependency: the round ends, and the session rebuilds with it
    ctx.kits.find({ id: 'airi.memory-backend' }) // the providers that the plugin can see
    ctx.extensions.find('plugin-b')
    ctx.effect(() => startWatcher()) // cleaned when the round ends
    await ctx.modules.upsert('notes', { kits: [fsStoreKit], setup: m => startNotes(m.kits.get(fsStoreKit)) })
  },
})
```

- `has`, `get`, and `find` are synchronous. The Host resolves the dependencies before setup starts.
- `ctx.self.rebuild({ uses })` replaces the dynamic dependencies. During setup, the current round ends. After setup, the old round serves until the new one runs. After 5 rebuilds in a row that add Kits, the session fails.
- Setup must be safe to run again. Register side effects with `ctx.effect()` or `ctx.subscriptions`.
- A Kit that is not in `kits.uses` needs an API grant, or `permissions.kits.dynamic` with an optional `allow` list. The Host asks `kitGrantPolicy` once and stores the answer. The check runs when the per-consumer client builds.

### Runners and the worker bridge

`createDirectRunner()` runs plugin code in the Host thread. It is the default. `createWorkerRunner()` from the Node entry runs each plugin in a `worker_threads` Worker and talks to it over an eventa channel. The bridge is a first version. It moves to `@injeca/bridge` later.

- The Host calls `startRound`, `abortRound`, `stopRound`, `startModule`, and `invokeProvider` (with the caller identity that the Host injects).
- The plugin calls `provide` (announce), `setStatus` (from `handle.setStatus()` of a provided Kit), `callKit`, `useKit`, `rebuild`, and `upsertModule`.
- A function in an argument or a result crosses as a callback, for example a harness hook listener. `callback.release` removes it.
- A worker exit sets the `runtime` node to `unavailable`, so the Kits of the plugin are `unavailable`, and selections move to the next provider.

### Harness hooks

`createHarnessKit()` is a reference `airi.harness` Kit. `hooks.on(event, handler, { priority })` registers the listener with injeca `listen` on the plugin container, so it goes away with the plugin. `runHarnessHooks(host.container, event, context)` runs the listeners in priority order with a timeout.

### Scenarios

[`examples/README.md`](./examples/README.md) runs five plugin scenarios in workers and prints their injeca timeline.

## Kit API Naming

Trusted Host-provided Kits hide transport details from extension authors. A normal extension uses a Host Kit as an API object directly from setup:

```ts
const gamelets = await ctx.kits.use(gameletKit)
await gamelets.mount(input)
```

Explicit module scopes provide advanced lifecycle and attribution. Use `module.kits.use(...)` only for a contribution with an independent lifecycle.

When a kit needs to work across process or network boundaries, expose shared Eventa invoke contracts from the kit package and build the client from those contracts. Do not introduce kit-specific transport method names such as `invokeGamelet`, `gameletRpc`, or `gameletRuntime`.

Use these names consistently:

| Name | Meaning |
| --- | --- |
| `gameletKitApis` | Shared Eventa API contract exported by the kit package. This is usually a map of `defineInvokeEventa(...)` entries. |
| `gameletKitService` | Host-side implementation of the kit behavior. It owns real side effects such as mounting, updating, and cleaning up UI. |
| `gameletKit` | The kit definition consumed by `ctx.kits.use(...)` or an optional module scope. It owns identity, version, availability policy, and client creation. |
| `gamelets` | The client instance returned to extension authors. Prefer a plural namespace when the client exposes multiple operations. |
| `createGameletKit(...)` | Factory that wires dependencies into `gameletKit`, including local client creation and remote Eventa-backed client creation. |

Example shape:

```ts
export const gameletKitApis = {
  mount: defineInvokeEventa<GameletMountResult, GameletMountInput>(
    'airi:kit:gamelet:mount',
  ),
}

export interface GameletKitService {
  mount: (input: GameletMountInput, scope: KitCallScope) => Promise<GameletMountResult>
}

export function createGameletKit(options: { service: GameletKitService }) {
  return defineKit<GameletClient>({
    id: 'kit.gamelet',
    version: '1.0.0',
    createClient(runtime) {
      return {
        mount: input => options.service.mount(input, runtime),
      }
    },
  })
}
```

Remote clients reuse Eventa invoke instead of defining a parallel RPC protocol.

If the transport can reconnect or start after the Client, use a lazy context callback:

```ts
const mount = defineInvoke(getContext, gameletKitApis.mount)

const gamelets = {
  mount(input: GameletMountInput) {
    return mount(input, scope)
  },
}
```

The shared artifact is the Eventa API contract, not the implementation function. Local clients can call `gameletKitService` directly. Remote clients call the same API through Eventa. Both expose the same authoring shape.
