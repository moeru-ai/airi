import type {
  Extension,
  ExtensionDynamicModuleContext,
  ExtensionEffect,
  ExtensionKitConsumer,
  ExtensionKitReader,
  ExtensionKitRegistry,
  ExtensionModuleContext,
  ExtensionModuleUpsertOptions,
  ExtensionSetupContext,
  RegisterExtensionModuleInput,
} from '../../extension/shared'
import type { KitAvailability, KitIdentity, KitUseResult } from '../../kit'
import type { KitContract, KitProvider, KitProviderHandle } from '../../kit/contract'
import type { KitInfo, KitReference, KitUse, NormalizedKitUse, RebuildDecision } from '../../kit/references'
import type { ExtensionProvidedKitDeclaration } from '../shared/types'
import type { CatalogSnapshot, HostPort, KitSnapshot, PluginEndpoint, RoundStartInput, SessionIdentity, WatchUpdate } from './ports'

import semver from 'semver'

import { DisposableStore } from '../../extension/disposable'
import { KitUnavailableError, kitUseFailure } from '../../kit'
import { createKitHandle, kitOfUse, normalizeKitUse } from '../../kit/references'
import { captureProvidedContract, captureProviderEndpoint, KitProviderRegistrationError } from '../kit-capture'
import { ExtensionRoundEndedError } from './errors'

/** The default time that `ctx.modules.upsert()` waits for its Kits. */
const defaultUpsertTimeoutMs = 10_000

interface RoundState {
  readonly id: string
  readonly identity: SessionIdentity
  readonly provides: readonly ExtensionProvidedKitDeclaration[]
  readonly store: DisposableStore
  readonly modules: Map<string, ExtensionModuleContext>
  readonly providers: Map<string, Readonly<Record<string, unknown>>>
  readonly announces: Promise<unknown>[]
  kits: Map<string, KitSnapshot>
  ended?: string
  setupDone: boolean
}

interface ModuleRun {
  readonly store: DisposableStore
}

interface DynamicModuleState {
  readonly setups: Map<number, ExtensionModuleUpsertOptions['setup']>
  readonly runs: Map<number, ModuleRun>
  nextRevision: number
}

function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range, { includePrerelease: true })
}

/**
 * Creates a client that sends each method call to the Host. It is the Kit client of a plugin in a worker.
 * A nested member, for example `hooks.on`, sends the dotted path. The client is not thenable, so `await` returns it as is.
 */
function createRemoteKitClient(call: (method: string, args: readonly unknown[]) => Promise<unknown>, path: readonly string[] = []): unknown {
  const target = Object.freeze(() => {})
  return new Proxy(target, {
    get: (_target, property) => {
      if (typeof property !== 'string' || property === 'then')
        return undefined
      return createRemoteKitClient(call, [...path, property])
    },
    apply: (_target, _thisArgument, args: unknown[]) => {
      if (path.length === 0)
        throw new TypeError('A Kit client is not a function.')
      return call(path.join('.'), args)
    },
  })
}

function effectInto(store: DisposableStore, setup: ExtensionEffect): void {
  const cleanup = setup()
  if (typeof cleanup === 'function')
    store.add({ dispose: cleanup })
}

/**
 * Runs one plugin and serves the Host calls for it.
 *
 * The same class runs in a worker thread behind the eventa bridge and in the Host thread for the direct runner.
 * It builds the setup context of each round, keeps the provider handlers, and runs dynamic modules.
 * The Host owns all dependency state. This class only mirrors the Kit snapshots that the Host sends.
 */
export class PluginRuntime implements PluginEndpoint {
  private readonly rounds = new Map<string, RoundState>()
  private readonly dynamicModules = new Map<string, DynamicModuleState>()
  private catalog: CatalogSnapshot = { kits: [], extensions: [] }

  constructor(
    private readonly extension: () => Promise<Extension>,
    private readonly host: HostPort,
  ) {}

  async load(input: { manifestId: string }): Promise<void> {
    const extension = await this.extension()
    if (extension.id !== input.manifestId)
      throw new Error(`Extension entrypoint id \`${extension.id}\` must match manifest id \`${input.manifestId}\`.`)
  }

  async startRound(input: RoundStartInput): Promise<void> {
    const extension = await this.extension()
    this.catalog = input.catalog
    const round: RoundState = {
      id: input.round,
      identity: input.identity,
      provides: input.provides,
      store: new DisposableStore(),
      modules: new Map(),
      providers: new Map(),
      announces: [],
      kits: new Map(input.kits.map(kit => [kit.id, kit])),
      setupDone: false,
    }
    this.rounds.set(round.id, round)
    await extension.setup(this.createSetupContext(round))
    this.assertActive(round)
    // The Host commits the provided Kits after setup, so each announce must arrive first.
    await Promise.all(round.announces)
    round.setupDone = true
  }

  async abortRound(input: { round: string, reason: string }): Promise<void> {
    const round = this.rounds.get(input.round)
    if (round)
      round.ended ??= input.reason
  }

  async stopRound(input: { round: string }): Promise<void> {
    const round = this.rounds.get(input.round)
    if (!round)
      return
    round.ended ??= 'The round stopped.'
    this.rounds.delete(input.round)

    const errors: unknown[] = []
    for (const module of [...round.modules.values()].reverse()) {
      try {
        await module.dispose()
      }
      catch (error) {
        errors.push(error)
      }
    }
    try {
      await round.store.dispose()
    }
    catch (error) {
      errors.push(error)
    }
    if (errors.length === 1)
      throw errors[0]
    if (errors.length > 1)
      throw new AggregateError(errors, `Extension \`${round.identity.id}\` cleanup failed.`)
  }

  async updateKits(input: { round: string, kits: readonly KitSnapshot[] }): Promise<void> {
    const round = this.rounds.get(input.round)
    if (round)
      round.kits = new Map(input.kits.map(kit => [kit.id, kit]))
  }

  async updateCatalog(input: { catalog: CatalogSnapshot }): Promise<void> {
    this.catalog = input.catalog
  }

  async startModule(input: { round: string, moduleId: string, revision: number, kits: readonly KitSnapshot[] }): Promise<void> {
    const state = this.dynamicModules.get(input.moduleId)
    const setup = state?.setups.get(input.revision)
    if (!state || !setup)
      throw new Error(`Dynamic module \`${input.moduleId}\` revision ${input.revision} is unknown.`)

    const store = new DisposableStore()
    const kits = new Map(input.kits.map(kit => [kit.id, kit]))
    state.runs.set(input.revision, { store })
    const context: ExtensionDynamicModuleContext = {
      id: input.moduleId,
      kits: this.createKitReader(() => kits, input.round, undefined),
      subscriptions: store,
      effect: setup => effectInto(store, setup),
    }
    try {
      await setup(context)
    }
    catch (error) {
      state.runs.delete(input.revision)
      await store.dispose()
      throw error
    }
  }

  async stopModule(input: { moduleId: string, revision: number }): Promise<void> {
    const state = this.dynamicModules.get(input.moduleId)
    const run = state?.runs.get(input.revision)
    if (!state || !run)
      return
    state.runs.delete(input.revision)
    state.setups.delete(input.revision)
    await run.store.dispose()
  }

  async dropModule(input: { moduleId: string, revision: number }): Promise<void> {
    this.dynamicModules.get(input.moduleId)?.setups.delete(input.revision)
  }

  async invokeProvider(input: { round: string, kitId: string, method: string, input: unknown, caller: { consumerExtensionId: string, consumerSessionId: string, consumerModuleId?: string } }): Promise<unknown> {
    const handlers = this.rounds.get(input.round)?.providers.get(input.kitId)
    const handler = handlers?.[input.method]
    if (typeof handler !== 'function')
      throw new KitUnavailableError(input.kitId, 'not-ready', `The provider has no method \`${input.method}\` in round ${input.round}.`)
    return await Reflect.apply(handler, undefined, [input.input, Object.freeze({ ...input.caller })])
  }

  private assertActive(round: RoundState): void {
    if (round.ended !== undefined)
      throw new ExtensionRoundEndedError(round.id, round.ended)
  }

  private clientOf(snapshot: KitSnapshot, round: string, scope: string | undefined): unknown {
    if (snapshot.value !== undefined)
      return snapshot.value
    return createRemoteKitClient((method, args) => this.host.callKit({ round, scope, kitId: snapshot.id, method, args }))
  }

  private createKitReader(kits: () => ReadonlyMap<string, KitSnapshot>, round: string, scope: string | undefined): ExtensionKitReader {
    const read = (use: KitUse): { snapshot?: KitSnapshot, normalized: NormalizedKitUse } => {
      const normalized = normalizeKitUse(use)
      const snapshot = kits().get(normalized.id)
      return { snapshot: snapshot && satisfies(snapshot.version, normalized.range) ? snapshot : undefined, normalized }
    }
    const get = (use: KitUse): unknown => {
      const { snapshot, normalized } = read(use)
      if (snapshot)
        return this.clientOf(snapshot, round, scope)
      if (normalized.optional)
        return undefined
      const present = kits().get(normalized.id)
      if (present)
        throw new KitUnavailableError(normalized.id, 'incompatible-version', `The dependency has version ${present.version}, but the use needs ${normalized.range}.`)
      throw new KitUnavailableError(normalized.id, 'missing-kit', 'It is not a dependency. Declare it in `kits.uses`, or call `ctx.kits.use()`.')
    }
    return {
      has: use => read(use).snapshot?.status !== undefined && read(use).snapshot?.status !== 'unavailable',
      get: get as ExtensionKitReader['get'],
    }
  }

  private createKitConsumer(round: RoundState, scope: string | undefined, store: DisposableStore): ExtensionKitConsumer {
    const consumer: ExtensionKitConsumer = {
      use: async <R extends KitReference>(use: R | KitUse<R>) => {
        this.assertActive(round)
        const normalized = normalizeKitUse(use)
        const local = scope === undefined ? round.kits.get(normalized.id) : undefined
        if (local && satisfies(local.version, normalized.range))
          return this.clientOf(local, round.id, scope) as never
        const snapshot = await this.host.useKit({ round: round.id, scope, kitId: normalized.id, range: normalized.range })
        return this.clientOf(snapshot, round.id, scope) as never
      },
      tryUse: async <R extends KitReference>(use: R | KitUse<R>) => {
        this.assertActive(round)
        const normalized = normalizeKitUse(use)
        const local = scope === undefined ? round.kits.get(normalized.id) : undefined
        if (local && satisfies(local.version, normalized.range))
          return { ok: true, client: this.clientOf(local, round.id, scope) } as KitUseResult<never>
        const result = await this.host.tryUseKit({ round: round.id, scope, kitId: normalized.id, range: normalized.range })
        if (result.ok)
          return { ok: true, client: this.clientOf(result.kit, round.id, scope) } as KitUseResult<never>
        return kitUseFailure(kitOfUse(use as KitUse), result.reason, result.detail)
      },
      watch: (use, callback) => {
        this.assertActive(round)
        const normalized = normalizeKitUse(use)
        const kit: KitIdentity = kitOfUse(use as KitUse)
        let disposed = false
        const toAvailability = (update: WatchUpdate): KitAvailability<never> => update.available
          ? { available: true, kit, client: this.clientOf(update.kit, round.id, scope) as never, status: update.kit.status }
          : { available: false, kit, reason: update.reason, error: new KitUnavailableError(kit.id, update.reason, update.detail) }
        const stop = this.host.watchKit({
          round: round.id,
          scope,
          kitId: normalized.id,
          range: normalized.range,
          callback: async (update) => {
            if (!disposed)
              await callback(toAvailability(update))
          },
        })
        return store.add({
          dispose: async () => {
            if (disposed)
              return
            disposed = true
            await (await stop)()
          },
        })
      },
    }
    return consumer
  }

  private createSetupContext(round: RoundState): ExtensionSetupContext {
    const reader = this.createKitReader(() => round.kits, round.id, undefined)
    const kits: ExtensionKitRegistry = {
      ...this.createKitConsumer(round, undefined, round.store),
      ...reader,
      find: filter => this.findKits(filter),
      provide: (contract, provider) => this.provide(round, contract, provider),
    }
    return {
      extension: { id: round.identity.id, version: round.identity.version, sessionId: round.identity.sessionId },
      subscriptions: round.store,
      effect: setup => effectInto(round.store, setup),
      kits,
      modules: {
        register: input => this.registerModule(round, input),
        upsert: (id, options) => this.upsertModule(round, id, options),
      },
      self: {
        rebuild: options => this.requestRebuild(round, options.uses),
      },
      extensions: {
        find: id => this.catalog.extensions.find(extension => extension.id === id),
      },
    }
  }

  private findKits(filter: { id?: string, range?: string } = {}): readonly KitInfo[] {
    return Object.freeze(this.catalog.kits
      .filter(kit => filter.id === undefined || kit.id === filter.id)
      .filter(kit => filter.range === undefined || satisfies(kit.version, filter.range))
      .map(kit => Object.freeze({
        ref: createKitHandle(kit.id, kit.version),
        id: kit.id,
        version: kit.version,
        provider: kit.provider,
        status: kit.status,
      })))
  }

  private provide<TContract extends KitContract>(round: RoundState, contract: TContract, provider: KitProvider<TContract>): KitProviderHandle {
    const owner = { extensionId: round.identity.id, sessionId: round.identity.sessionId }
    if (round.setupDone || round.ended !== undefined)
      throw new KitProviderRegistrationError('provide-after-setup', String(contract?.id ?? ''), owner.extensionId, owner.sessionId)

    const accepted = captureProvidedContract(contract, owner)
    const id = accepted.contract.id
    const declaration = round.provides.find(candidate => candidate.id === id)
    if (!declaration)
      throw new KitProviderRegistrationError('undeclared-kit', id, owner.extensionId, owner.sessionId)
    if (round.providers.has(id))
      throw new KitProviderRegistrationError('duplicate-provide', id, owner.extensionId, owner.sessionId)
    if (accepted.contract.version !== declaration.version)
      throw new KitProviderRegistrationError('kit-version-mismatch', id, owner.extensionId, owner.sessionId)
    if (!accepted.contract.allowedExposePolicies?.includes(declaration.exposure))
      throw new KitProviderRegistrationError('kit-exposure-mismatch', id, owner.extensionId, owner.sessionId)

    const endpoint = captureProviderEndpoint(accepted, provider, owner)
    // Input getters can reenter registration. Check the state again before the write.
    if (round.providers.has(id))
      throw new KitProviderRegistrationError('duplicate-provide', id, owner.extensionId, owner.sessionId)
    round.providers.set(id, endpoint.methods)
    const announced = this.host.provide({
      round: round.id,
      kitId: id,
      version: accepted.contract.version,
      allowedExposePolicies: accepted.contract.allowedExposePolicies ?? [],
      methods: accepted.methodNames,
    })
    round.announces.push(announced)
    let disposed = false
    return {
      dispose: async () => {
        if (disposed)
          return
        disposed = true
        const { handle } = await announced
        await this.host.withdrawProvide({ round: round.id, handle })
      },
      setStatus: (status, options) => {
        void this.host.setStatus({ round: round.id, kitId: id, status, reason: options?.reason, cause: options?.cause }).catch(() => undefined)
      },
    }
  }

  private requestRebuild(round: RoundState, uses: readonly KitUse[]): RebuildDecision {
    this.assertActive(round)
    const normalized = Object.freeze(uses.map(normalizeKitUse))
    const phase = round.setupDone ? 'running' : 'setup'
    if (phase === 'setup')
      round.ended = 'A rebuild started during setup.'
    const request = this.host.rebuild({ round: round.id, uses: normalized })
    if (phase === 'setup')
      round.announces.push(request.catch(() => undefined))
    else
      void request.catch(() => undefined)
    return Object.freeze({ kind: 'rebuild', phase, uses: normalized })
  }

  private async registerModule(round: RoundState, input: RegisterExtensionModuleInput): Promise<ExtensionModuleContext> {
    this.assertActive(round)
    if (round.modules.has(input.id))
      throw new Error(`Extension module \`${input.id}\` is already registered for session ${round.identity.sessionId}.`)

    const { scope, permissions } = await this.host.registerScope({
      round: round.id,
      moduleId: input.id,
      permissions: input.permissions,
      labels: input.labels,
    })
    const subscriptions = new DisposableStore()
    let disposePromise: Promise<void> | undefined
    const module: ExtensionModuleContext = {
      id: input.id,
      identity: { id: input.id, extension: { ...round.identity }, labels: input.labels },
      permissions,
      kits: this.createKitConsumer(round, scope, subscriptions),
      subscriptions,
      dispose: () => {
        disposePromise ??= (async () => {
          const errors: unknown[] = []
          // Bindings disappear before the module callbacks run. A binding failure does not skip them.
          try {
            await this.host.disposeScope({ round: round.id, scope })
          }
          catch (error) {
            errors.push(error)
          }
          try {
            await subscriptions.dispose()
          }
          catch (error) {
            errors.push(error)
          }
          finally {
            round.modules.delete(input.id)
          }
          if (errors.length === 1)
            throw errors[0]
          if (errors.length > 1)
            throw new AggregateError(errors, `Extension module \`${input.id}\` cleanup failed.`)
        })()
        return disposePromise
      },
    }
    round.modules.set(input.id, module)
    return module
  }

  private async upsertModule(round: RoundState, id: string, options: ExtensionModuleUpsertOptions): Promise<void> {
    this.assertActive(round)
    let state = this.dynamicModules.get(id)
    if (!state) {
      state = { setups: new Map(), runs: new Map(), nextRevision: 1 }
      this.dynamicModules.set(id, state)
    }
    const revision = state.nextRevision++
    state.setups.set(revision, options.setup)
    try {
      await this.host.upsertModule({
        round: round.id,
        moduleId: id,
        revision,
        kits: options.kits.map(normalizeKitUse),
        timeoutMs: options.timeoutMs ?? defaultUpsertTimeoutMs,
      })
    }
    catch (error) {
      if (!state.runs.has(revision))
        state.setups.delete(revision)
      throw error
    }
  }
}
