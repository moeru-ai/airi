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

The Host reserves every declared Kit before setup starts. It publishes all registrations only after setup succeeds. If setup fails or omits a declared Kit, the Host rolls back the registrations. Stop and reload withdraw the exact Provider session. A stale handle cannot withdraw a later generation.

Only root setup can provide a Kit. Module scopes can consume Host-provided Kits, but they cannot provide an Extension-hosted Kit. Phase 3 stores Provider handlers without invoking them. Consumer Clients, method calls, events, permissions, and transport belong to Phase 4.

Load the [registration example](../../apps/stage-tamagotchi/src/main/services/airi/plugins/examples/hosted-kit-provider/README.md) through the Extension Host Inspector.

The manifest owns the Extension version for the Host session. `defineExtension(...)` must use the same Extension id.

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
