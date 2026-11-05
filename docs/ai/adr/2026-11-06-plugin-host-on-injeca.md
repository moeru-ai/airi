# Run the plugin host on injeca, with typed Kit references

Status: proposed

## Context

The [plugin system layers ADR](./2026-11-05-plugin-system-layers.md) makes injeca the runtime core of the plugin system. This ADR gives the shape of `@proj-airi/plugin-sdk` and the Electron plugin host on injeca 0.3.

Today plugin-sdk manages registration, dependency state, cleanup, sessions, and activation order with its own code: `KitProviderRegistry`, `DependencyService`, the session cleanup chain, and the Activation Planner. injeca 0.3 has these capabilities: services that change at run time, convergence, status propagation, atomic replacement, transactions, child containers, resolution conditions, and graph queries.

Plugin authors need these cases:

1. A plugin uses Kits that the host has.
2. A plugin uses Kits that another plugin provides. That plugin can already run when the new plugin is installed.
3. A plugin decides at run time that it needs more Kits, and it rebuilds itself with the new dependencies.
4. A plugin runs code that an agent writes at run time, for example a shell plugin.
5. A Kit has more than one provider, and the user selects the provider, for example a better memory backend in place of the built-in one.

## Decision

### Kits are neutral

- A Kit is a capability contract: an id, a version, methods, and events. `defineKitContract` creates it.
- The host and plugins can both provide a Kit. A Kit that the host provides is a built-in Kit. A Kit that a plugin provides is a plugin Kit. Consumers do not see the difference.
- A plugin depends on a Kit, not on a plugin. The Manifest field `suggests` can name plugins that provide the Kit. The installer uses it as a hint. It does not take part in the run-time binding.
- A plugin that provides a Kit publishes the contract in a package, for example `@plugin-b/kits`. Consumers import the contract from that package.

### The host graph

```text
tamagotchi main container
└─ plugin-host container
   ├─ kit:<id>@host            built-in Kits, perConsumer services
   ├─ kit:<id>                 selection service for a Kit with more than one provider
   └─ plugin:<id> container    one for each plugin
      ├─ package               reads the files with the file system loader and validates the Manifest
      ├─ compat                checks the runtime and the engine version
      ├─ runtime               starts the worker and opens the eventa channel
      ├─ session               runs setup in the worker. dependsOn: runtime and each used Kit
      ├─ module:<id>           a module or a script, with its own Kit dependencies
      └─ kit:<id>@<plugin>     each Kit that the plugin provides, exported to the plugin-host area
```

- `package`, `compat`, and `runtime` do not depend on Kits. The worker can start before the Kits are available.
- `session` depends on `runtime` and on each Kit that the plugin uses. A required Kit uses `where(kitKey(id), satisfies(range))`. An optional Kit uses `optional(...)`.
- A plugin Kit is a proxy service on the host side. Its value is an RPC client for the contract. Its status comes from the plugin through `setStatus`, with a cause chain.
- Plugins run in a worker thread or a worker process. The `@injeca/bridge` package carries setup, provides, status reports, calls, and hook listeners between the worker and the host.
- A built-in Kit and a plugin Kit are `perConsumer` services. The host builds one client for each consumer container. The build injects the caller identity and checks the permissions.

### Provider selection

- Each provider registers a key with a provider suffix: `kit:airi.memory-backend@host` and `kit:airi.memory-backend@bmb`.
- The host registers one selection service, `kit:airi.memory-backend`, with `firstAvailable(...)` over the providers. The order comes from the user settings.
- Consumers depend on the selection service. When the selected provider becomes unavailable, the selection moves to the next provider, and consumers get `dependency-change`.
- With this rule, two providers of one Kit do not conflict.

### Typed Kit references

The contract object is the typed key. A plugin does not get injeca keys or containers.

```ts
interface ExtensionKits {
  has: (kit: KitRef<unknown>) => boolean
  get: (<T>(kit: KitRef<T>) => T) & (<T>(kit: OptionalKitUse<T>) => T | undefined)
  use: <T>(kit: KitRef<T>) => Promise<T>
  find: (filter: { id?: string, range?: string }) => readonly KitInfo[]
}

interface ExtensionSelf {
  rebuild: (options: { uses: readonly KitUse[] }) => RebuildDecision
}

interface ExtensionDirectory {
  find: (id: string) => ExtensionInfo | undefined
}

type KitUse = KitRef<unknown> | OptionalKitUse<unknown> | RangedKitUse<unknown>

interface KitInfo {
  ref: KitRef<unknown>
  id: string
  version: string
  provider: { kind: 'host' | 'extension', id: string }
  status: 'ready' | 'degraded' | 'unavailable'
}

declare function optional<T>(kit: KitRef<T>): OptionalKitUse<T>
declare function range<T>(kit: KitRef<T>, range: string): RangedKitUse<T>
declare function narrow<T>(ref: KitRef<unknown>, contract: KitRef<T>): KitRef<T> | undefined
```

- The type follows the reference. `ctx.kits.get(fsStoreKit)` returns the client type of `fsStoreKit`.
- The default version range of a reference is `^<major>` of its contract version.
- `find` reads the host graph. It returns only the entries that the plugin has permission to see.
- `narrow` checks the id and the version of an unknown reference against a contract. With a schema in the contract, it also checks the methods.
- A plugin can see plugins and Kits. It cannot see containers.

### Dependencies

**Static.** The Manifest field `kits.uses` lists the Kits that the plugin uses. The host maps the list to the `dependsOn` of `session`. The plugin code does not run before the required Kits are available.

**Modules.** A plugin that starts to use a Kit at run time registers a module with its own dependencies. The session does not rebuild.

```ts
await ctx.modules.upsert('notes', {
  kits: [fsStoreKit, optional(autoMemoryKit)],
  setup: m => startNotes(m.kits.get(fsStoreKit)),
  timeoutMs: 10_000,
})
```

- The first `upsert` of an id calls `provide` in the plugin container.
- A later `upsert` of the same id calls `replace()` with the new `dependsOn` and the new setup. The old module serves until the new one runs.
- If a new dependency does not become available before `timeoutMs`, `upsert` rejects with the explanation, and the old module stays.
- A newer `upsert` cancels an earlier one that is not complete.

**Rebuild of the plugin.** `ctx.self.rebuild({ uses })` replaces the `session` registration with the new `dependsOn`.

- During setup, the current setup round ends. Its effects and stop hooks run. The new session builds when the new dependencies are available.
- After setup, it is an atomic replacement. The old session serves until the new one runs.
- The worker does not restart, because `runtime` does not depend on Kits.

**Discovery.** `ctx.kits.use(kit)` for a Kit that `session` does not depend on starts a rebuild with that Kit added. The current setup round ends at that call.

Rules for a rebuild:

- Setup must be safe to run again. Register side effects with `effect()` or `on('stop')`.
- Call `use` for each Kit at the start of setup, before side effects.
- A rebuild by discovery only adds dependencies. To remove a dependency, call `ctx.self.rebuild({ uses })`.
- After 5 rebuild rounds in a row that add dependencies, the session goes to `failed`.
- The host stores the found dependencies. The next start builds the session with them.

### Permissions

- A plugin that adds Kits at run time declares `permissions.kits.dynamic` in its Manifest, with an optional `allow` list of id patterns.
- The first use of a Kit that is not in the static list and not granted asks the user, or follows the user policy. The grant is stored. A denied request rejects with `permission-denied`.
- The host checks the permissions when it builds the `perConsumer` client. Code in the worker cannot get a Kit without a grant.

### Hooks of the harness

- The harness is a built-in Kit. Its turn hooks, for example `context.inject` and `context.transform`, register through `listen(pluginContainer, event, handler, metadata)` on the host side.
- The plugin container owns the listener. When the plugin unloads, the listener goes away.
- The harness reads `listeners(root, event)` and runs them with its own rules: order, latency budget, timeout, and failure policy.
- A handler in a worker is an eventa invoke on the host side.

### What plugin-sdk deletes or keeps

| Part | Fate | Replacement |
| --- | --- | --- |
| Activation Planner | Delete | Manifest checks at import, `where` for versions, `graph().explain()` and `graph().cycles()` for diagnostics |
| `DependencyService`, `KitRegistryService`, `ResourceService`, `extension-sessions`, the Node cleanup context | Delete | Services, status, `watch`, `waitFor`, containers |
| `KitProviderRegistry` slots, generations, tokens, leases, session transactions | Shrink to Kit policy | Registrations, instances, `transaction()` |
| Kit contracts, `defineKit`, `KitRef`, exposure policy, permissions, Manifest | Keep | |
| `ctx.kits.use`, `tryUse`, `watch`, `provide` | Keep the public shape | Built on `resolve`, `peek`, `invoke`, and transactions |

### Behavior changes

- A plugin whose required Kit is missing installs and waits in `pending`. Today the Planner rejects it. The plugin page shows the explanation.
- An unload does not wait for a setup that does not settle. injeca 0.3.1 stops at once after it aborts the start hook.
- A cleanup that waits for its own plugin after an `await` ends with the stop timeout. Today plugin-sdk detects it with `AsyncLocalStorage`.

## Implementation

The branch `neko/refactor/plugin-sdk-injeca` builds this design on the local injeca build with exported registrations. These details differ from the proposal or add to it.

### Graph

| Node | Container | Shape |
| --- | --- | --- |
| `kit:<id>@host` | plugin host | One service. Its value connects a client for each caller. |
| `kit:<id>#<range>` | plugin host | The selection for one version range. `perConsumer`, with `where(firstAvailable(...), range)` over the provider keys in the configured order. The Host Kit comes first by default. |
| `kit:<id>@<plugin>` | plugin | Exported. Its value connects a client for each caller. Its status follows the reports of the plugin and the health of `runtime`. |
| `package`, `compat`, `runtime`, `session` | plugin | One plugin container for each session. The owner is `{ kind: 'plugin', pluginId, sessionId, version }`. |
| `module:<id>` | plugin | A dynamic module from `ctx.modules.upsert()`. |
| module scope | child of plugin | `ctx.modules.register()` creates a child container, so its clients have the module as caller. |

- The selection is the only `perConsumer` Kit service. A `perConsumer` service resolves its dependencies from its registration container, so a provider behind the selection cannot see the consumer. The selection build checks the grant of the consumer and connects the client with the caller identity. A denied grant fails that consumer instance with `permission-denied`.
- A session depends on the selection of its range. The selection skips a provider with a version outside the range and selects the next one. A range gets its selection service on its first use, or with the first provider of the Kit.
- The selection handles `dependency-change` in place. Its stable client forwards to the new provider, so a holder of the client, for example `resolveKit()` or plugin code, follows the provider without a new call.
- `reload(id)` stops the old session, then starts a new one. `reload(id, { atomic: true })` starts a new plugin container first. Its exports take over, and the consumers move with `dependency-change`. Fixed binding ids collide in the atomic form, so it is not the default.
- One session service instance is one setup round. A rebuild during setup replaces the registration, and the start hook signal ends the old round. A rebuild after setup is an atomic replacement. The new round replaces the exports with `tx.replace`.

### Plugin side

- `ctx.effect(setup)` stores a cleanup with the setup round.
- `ctx.kits.tryUse()` resolves a Kit now and does not rebuild. `ctx.kits.use()` in a module scope does the same.
- `ctx.kits.watch()` follows the selection with injeca `watch`. The watch demands the consumer instance, also when the selection registers later.
- The Host stores found dependencies in an injectable `KitDependencyStore`, and dynamic grants in a `KitGrantStore`. Both are in memory now.

### Runners and the bridge

- `createDirectRunner()` runs the plugin in the Host thread. The Electron host uses it, because its Host Kits pass objects that cannot cross a worker boundary.
- `createWorkerRunner()` runs each plugin in a `worker_threads` Worker. The first bridge is in plugin-sdk (`plugin-host/bridge/channel.ts`). Each port method is one eventa invoke. Functions cross as callbacks, and errors cross with their class and fields.
- A worker exit sets `runtime` to `unavailable`. Cleanup calls to an ended worker resolve, and other calls reject.

### Harness hooks

`createHarnessKit()` and `runHarnessHooks()` are a reference in plugin-sdk. The real AIRI harness does not use them yet.

### Behavior changes

- A plugin whose required Kit is missing installs and waits in `pending`. The Electron host no longer rejects the enablement or the unload of a provider.
- Two providers of one Kit do not conflict. A Host Kit id in `provides` is a second provider.
- An unload does not wait for a setup that does not settle. `start` rejects with `stopped before setup completed`.
- A cleanup that stops its own session rejects with `reentrant-dispose` on Node. A Web Host ends it with the stop timeout.
- `ctx.kits.use()` of a Kit that is not a dependency rebuilds the session, so setup runs again.

### injeca gaps found

The build found five gaps in injeca. injeca fixed all of them before release, so plugin-sdk has no workaround for them:

- A `perConsumer` service resolves its dependencies from its registration container, also for an export.
- `where()` accepts `firstAvailable()`, and `explain()` names each rejected candidate.
- A rebuild of a running service is make-before-break. Its dependents get `dependency-change`, not a withdrawal.
- An optional or fallback edge demands the consumer service of a `perConsumer` key that registers later.
- `explain()` has `replacement` for a pending `replace()`.

An upsert timeout still explains the Kit selections of the module, not `replacement`. The upsert resolves the Kits before `replace()`, because a pending `replace()` cannot be cancelled without a successor, and the old module must stay after a timeout.

## Consequences

- One graph holds the host services, the built-in Kits, the plugins, and the plugin Kits. Install, uninstall, reload, failure, and status changes follow the injeca rules.
- Plugins that start in any order converge. A plugin installed after its provider starts at once. A provider installed later starts the waiting plugins.
- Plugin authors use typed references and do not see injeca.
- plugin-sdk deletes about 970 lines of non-test code and shrinks about 880 more. The Electron host deletes about 380 lines.
- Plugin Kits need exported registrations in injeca, and plugins in workers need `@injeca/bridge`.

## Relation to other ADRs

| ADR | Relation |
| --- | --- |
| [Plugin system layers](./2026-11-05-plugin-system-layers.md) | This ADR gives the plugin-sdk shape for its layers. |
| [Hosted Kit registration](./2026-09-22-hosted-kit-registration.md) | Its rules move to injeca registrations and transactions. |
| [Agent harness](./2026-10-29-agent-harness.md) | The harness turn hooks use the listener registry. |

## Open questions

- The user interface for provider selection and for dynamic Kit grants.
- Where the grant store and the found dependencies persist in the Electron host.
- How Host Kits that pass objects, for example the gamelet and tool Kits, run with the worker runner.

## Follow-up

- Release injeca 0.3.1 with exported registrations and the gap fixes, and drop the local `file:` override.
- Design and implement `@injeca/bridge`, and move the first bridge out of plugin-sdk.
- Move plugin-sdk in small pull requests: remove the unused registries, put the host on a container, make Kit selections `perConsumer`, run sessions in child containers, publish plugin Kits through transactions, replace the Planner, and add the graph view to the inspector.
- Explain the removal of the Activation Planner in issue #2507.
