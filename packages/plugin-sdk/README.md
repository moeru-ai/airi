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
        "version": "1.0.0",
        "optional": true
      }
    ]
  }
}
```

Manifest parsing is strict. Unknown fields, unsafe ids, empty entrypoints, and missing runtime entrypoints fail validation. The manifest owns the Extension version used by the Host session. `defineExtension(...)` owns runtime setup and must use the same Extension id.

## Extension-hosted Kits

A Provider Extension registers method handlers during `setup`. Its manifest must declare the same Kit id, version, and exposure policy. Method inputs, method outputs, and event payloads must use `KitValue`.

```ts
interface AgentActivity {
  agentId: string
  state: 'waiting-for-user' | 'completed'
  summary: string
}

const agentActivityKit = defineKitContract({
  id: 'dev.airi.agent-activity',
  version: '1.0.0',
  allowedExposePolicies: ['local-only'],
  methods: {
    getCurrentActivity: defineKitMethod<undefined, AgentActivity>(),
  },
  events: {
    activityChanged: defineKitEvent<AgentActivity>(),
  },
})

export default defineExtension({
  id: 'agent-activity-provider',
  setup(ctx) {
    const provider = ctx.kits.provide(agentActivityKit, {
      methods: {
        getCurrentActivity() {
          return currentActivity
        },
      },
    })

    ctx.subscriptions.add(
      observeAgentActivity((activity) => {
        provider.emit('activityChanged', activity)
      }),
    )
  },
})
```

A Consumer Extension imports the shared contract. The Consumer manifest declares the Kit in `kits.uses` and requests `apis.invoke` permission.

```ts
export default defineExtension({
  id: 'agent-activity-consumer',
  async setup(ctx) {
    const activityClient = await ctx.kits.use(agentActivityKit)
    ctx.subscriptions.add(activityClient.activityChanged.subscribe((activity) => {
      reactWithAiri(activity)
    }))

    const currentActivity = await activityClient.getCurrentActivity()
    reactWithAiri(currentActivity)
  },
})
```

The Host permits one active Provider for each Kit id. The Host creates each Consumer client and routes its methods and events. A Provider object never crosses the Kit seam. Provider unload removes the registration, closes subscriptions, and updates Kit watchers.

The desktop example is in `apps/stage-tamagotchi/src/main/services/airi/plugins/examples/devtools-extension-hosted-kit`.

## Host-provided Kit Naming

Host-provided Kits are trusted local capabilities. They can use `defineKit(...)` and `createClient(...)` when structured `KitValue` cannot represent the capability. The Tool Kit uses this path because tool definitions contain execution callbacks.

Host-provided Kits must hide transport details from Extension authors. A normal Extension uses the Kit as a normal client from setup:

```ts
const gamelets = await ctx.kits.use(gameletKit)
await gamelets.mount(input)
```

Explicit module scopes are an advanced lifecycle and attribution API. Use `module.kits.use(...)` only when the host needs a contribution to be associated with a sub-scope that may later be inspected, disposed, or restarted independently.

When a Host-provided Kit works across process or network seams, expose shared Eventa contracts from the Kit package. Do not add transport names such as `invokeGamelet`, `gameletRpc`, or `gameletRuntime` to the author-facing client.

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
