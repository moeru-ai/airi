# @proj-airi/plugin-sdk

Runtime-agnostic SDK for AIRI extensions.

## Kit API Naming

Kits should hide transport details from extension authors. A normal extension should use a kit as a normal API object directly from setup:

```ts
const gamelets = await ctx.kits.use(gameletKit)
await gamelets.mount(input)
```

Explicit module scopes are an advanced lifecycle and attribution API. Use `module.kits.use(...)` only when the host needs a contribution to be associated with a sub-scope that may later be inspected, disposed, or restarted independently.

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

Remote clients should reuse Eventa invoke instead of defining a parallel RPC protocol. Use a lazy context callback when the underlying transport can reconnect or be created after the client object:

```ts
const mount = defineInvoke(getContext, gameletKitApis.mount)

const gamelets = {
  mount(input: GameletMountInput) {
    return mount(input, scope)
  },
}
```

The shared artifact is the Eventa API contract, not the implementation function. Local clients may call `gameletKitService` directly; remote clients call the same API through Eventa. Both should expose the same authoring shape.
