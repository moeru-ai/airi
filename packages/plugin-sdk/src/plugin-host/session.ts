import type {
  BuildContext,
  Container,
  DecideFor,
  DependencyDeclarations,
  OwnerRecord,
  ProvideOptionWithKeys,
  Registration,
  ServiceStatus,
  SetStatusOptions,
} from 'injeca'

import type { Extension } from '../extension/shared'
import type { KitStatus, NormalizedKitUse } from '../kit/references'
import type { CatalogSnapshot, HostPort, KitSnapshot, PluginEndpoint, ProvideAnnounceInput, TryUseResult, WatchUpdate } from './bridge/ports'
import type { KitDependencyStore, KitGrantPolicy, KitGrantStore } from './kits/access'
import type { KitGraph } from './kits/kit-graph'
import type { KitProviderValue } from './kits/values'
import type { PluginRunner, PluginRunnerHandle } from './runners/types'
import type { KitApiBindingRegistryService, PermissionService } from './runtimes/shared'
import type {
  ExtensionManifestV2,
  ExtensionProvidedKitDeclaration,
  ModulePermissionDeclaration,
  ModulePermissionGrant,
  PluginRuntime,
} from './shared/types'

import semver from 'semver'

import { errorMessageFrom } from '@moeru/std'
import {
  createContainer,
  defineKey,
  dispose,
  effect,
  graph,
  observe,
  peek,
  provide,
  resolve,
  start,
  timeout,
  transaction,
  WaitTimeoutError,
  watch,
  withTimeout,
} from 'injeca'

import { KitUnavailableError } from '../kit/errors'
import { encodeError, ExtensionRebuildLimitError, ExtensionRoundEndedError, ModuleUpsertError } from './bridge/errors'
import { describeExplanation } from './diagnostics'
import { KitProviderRegistrationError } from './kit-capture'
import { matchKitPattern } from './kits/access'
import { createKitProviderValue, kitProviderKey, kitSelectionKey, moduleNodeKey, pluginNodeKeys, SelectedKit } from './kits/values'
import { parseExtensionManifest } from './shared/manifest'

/** The time that `tryUse` and a module scope `use` wait for a Kit that has a provider. */
const resolveNowTimeoutMs = 2_000

/** The phases of a session that the Host reports. */
export type ExtensionSessionPhase = 'pending' | 'setting-up' | 'ready' | 'failed' | 'stopped'

/** One module scope from `ctx.modules.register()`, as the Host sees it. */
export interface ExtensionModuleScope {
  readonly id: string
  readonly permissions: ModulePermissionGrant
  readonly labels?: Record<string, string>
}

/**
 * Describes the host-owned state for one extension session.
 */
export interface ExtensionSession {
  /** Unique host-generated session id. */
  readonly id: string
  /** Extension identity and session metadata. */
  readonly extension: {
    readonly id: string
    readonly version?: string
    readonly sessionId: string
  }
  /** Manifest used to start this extension. */
  readonly manifest: ExtensionManifestV2
  /** Working directory used to resolve relative manifest entrypoints. */
  readonly cwd?: string
  /** Runtime used to choose manifest entrypoints. */
  readonly runtime?: PluginRuntime
  /** The kind of runner that runs the plugin code, for example `direct` or `worker`. */
  readonly runner: string
  /** Current extension setup phase. It follows the session service in the graph. */
  readonly phase: ExtensionSessionPhase
  /** Why the session is not ready, in one line for each blocker. */
  readonly explanation: string | undefined
  /** Module scopes registered by the current setup round. */
  readonly modules: ReadonlyMap<string, ExtensionModuleScope>
  /** Requested and granted permissions for the extension session. */
  readonly permissions: {
    readonly requested: ModulePermissionDeclaration
    readonly granted: ModulePermissionGrant
    readonly revision: number
  }
}

/** What a session controller needs from its Host. */
export interface SessionHost {
  readonly container: Container
  readonly kits: KitGraph
  readonly permissions: PermissionService
  readonly bindings: KitApiBindingRegistryService
  readonly grantPolicy: KitGrantPolicy
  readonly grantStore: KitGrantStore
  readonly dependencyStore: KitDependencyStore
  readonly rebuildLimit: number
  readonly assertCompatible: (manifest: ExtensionManifestV2, runtime: PluginRuntime) => void
  readonly catalogFor: (session: PluginSessionController) => CatalogSnapshot
  readonly changed: () => void
  /** Stops one session through the Host, so that the session map and the catalog follow. */
  readonly stopSession: (sessionId: string, signal: AbortSignal | undefined) => Promise<void>
}

/** The input of one session. */
export interface PluginSessionInput {
  readonly sessionId: string
  readonly manifest: ExtensionManifestV2
  readonly cwd?: string
  readonly runtime: PluginRuntime
  readonly runner: PluginRunner
  readonly extension?: Extension
  readonly permissions: { requested: ModulePermissionDeclaration, granted: ModulePermissionGrant, revision: number }
}

interface ProvideEntry {
  readonly handle: string
  readonly input: ProvideAnnounceInput
  withdrawn: boolean
}

interface HostRound {
  readonly id: string
  phase: 'setting-up' | 'ready' | 'stopped'
  deps: Map<string, SelectedKit>
  readonly provides: Map<string, ProvideEntry>
  readonly exportStatus: Map<string, (status: ServiceStatus, options?: SetStatusOptions) => void>
  readonly watchers: Set<{ readonly withdraw: () => Promise<boolean> }>
  readonly scopes: Set<string>
  unsubscribe: Array<() => void>
  ended?: string
  failure?: unknown
  cleaned?: Promise<void>
}

interface ScopeRecord {
  readonly id: string
  readonly round: string
  readonly container: Container
  readonly permissions: ModulePermissionGrant
  readonly explicit: boolean
  readonly labels?: Record<string, string>
}

interface DynamicModuleRecord {
  registration?: Registration<string, unknown, undefined>
  revision?: number
  pending?: AbortController
}

interface RuntimeValue {
  readonly handle: PluginRunnerHandle
}

function satisfies(version: string, range: string): boolean {
  return semver.satisfies(version, range, { includePrerelease: true })
}

function errorsInto(errors: unknown[], message: string): void {
  if (errors.length === 1)
    throw errors[0]
  if (errors.length > 1)
    throw new AggregateError(errors, message)
}

/** Reads the selected Kits from the resolved dependencies of a session or a module. */
function selectedKitsOf(values: Readonly<Record<string, unknown>>): Map<string, SelectedKit> {
  const kits = new Map<string, SelectedKit>()
  for (const [name, value] of Object.entries(values)) {
    if (!name.startsWith('kit:'))
      continue
    const resolved = value instanceof SelectedKit
      ? value
      : (value as { value?: unknown } | undefined)?.value
    if (resolved instanceof SelectedKit)
      kits.set(resolved.kitId, resolved)
  }
  return kits
}

const phaseOfService: Readonly<Record<string, ExtensionSessionPhase>> = {
  declared: 'pending',
  pending: 'pending',
  conflict: 'pending',
  building: 'setting-up',
  starting: 'setting-up',
  retrying: 'setting-up',
  running: 'ready',
  stopping: 'stopped',
  failed: 'failed',
  withdrawn: 'stopped',
}

/**
 * Owns one plugin session: one child container of the plugin host container.
 *
 * The container has these nodes:
 *
 * - `package` validates the Manifest.
 * - `compat` checks the runtime and the AIRI version.
 * - `runtime` starts the plugin runtime with the runner. It does not depend on Kits.
 * - `session` runs setup. It depends on `runtime` and on each Kit that the plugin uses. One instance is one setup round.
 * - `module:<id>` runs one dynamic module with its own Kit dependencies.
 * - `kit:<id>@<plugin>` is one exported proxy for each Kit that the plugin provides.
 *
 * The controller implements the Host side of the bridge ({@link HostPort}).
 */
export class PluginSessionController implements HostPort {
  readonly container: Container
  readonly session: ExtensionSession
  private readonly rounds = new Map<string, HostRound>()
  private readonly scopes = new Map<string, ScopeRecord>()
  private readonly dynamicModules = new Map<string, DynamicModuleRecord>()
  private readonly exportRegistrations = new Map<string, Registration<string, KitProviderValue, undefined>>()
  private readonly staticUses: readonly NormalizedKitUse[]
  private sessionRegistration?: Registration<string, unknown, undefined>
  private exportsOwner?: string
  private rebuildsInRow = 0
  private passesValues = false
  private stopped = false
  private stopping?: Promise<void>
  private readonly settleChecks = new Set<() => void>()
  /** The injeca hook signal of each plugin-side cleanup run that has not ended, by run id. `stopSession` passes it to injeca. */
  private readonly cleanupRuns = new Map<string, AbortSignal>()
  private nextCleanupRun = 0

  constructor(private readonly host: SessionHost, readonly input: PluginSessionInput) {
    this.container = createContainer({
      parent: host.container,
      owner: { kind: 'plugin', pluginId: input.manifest.id, sessionId: input.sessionId, version: input.manifest.version },
    })
    this.staticUses = Object.freeze((input.manifest.kits?.uses ?? []).map(use => Object.freeze({
      id: use.id,
      range: use.version,
      optional: use.optional === true,
    })))
    const controller = this
    this.session = {
      id: input.sessionId,
      extension: Object.freeze({ id: input.manifest.id, version: input.manifest.version, sessionId: input.sessionId }),
      manifest: input.manifest,
      cwd: input.cwd,
      runtime: input.runtime,
      runner: input.runner.kind,
      get phase() {
        return controller.currentPhase()
      },
      get explanation() {
        return controller.explain()
      },
      get modules() {
        return new Map([...controller.scopes.values()].map(scope => [scope.id, { id: scope.id, permissions: scope.permissions, labels: scope.labels }]))
      },
      permissions: input.permissions,
    }
  }

  get pluginId(): string {
    return this.input.manifest.id
  }

  get sessionId(): string {
    return this.input.sessionId
  }

  /** The provided Kit declarations of the Manifest. */
  get provides(): readonly ExtensionProvidedKitDeclaration[] {
    return this.input.manifest.kits?.provides ?? []
  }

  /** Registers the nodes and starts the container. */
  install(): void {
    const { manifest, runtime, runner } = this.input
    const packageKey = defineKey<ExtensionManifestV2>(pluginNodeKeys.package)
    const compatKey = defineKey<ExtensionManifestV2>(pluginNodeKeys.compat)
    const runtimeKey = defineKey<RuntimeValue>(pluginNodeKeys.runtime)

    provide(this.container, packageKey, {
      metadata: { kind: 'plugin-node', node: 'package' },
      build: () => {
        // A loaded Extension has no entrypoint files, so only a Manifest that the runner loads must pass the full schema.
        if (this.input.extension)
          return manifest
        const parsed = parseExtensionManifest(manifest)
        if (!parsed.success)
          throw new Error(`Extension \`${manifest.id}\` has an invalid Manifest: ${parsed.diagnostics.map(diagnostic => `${diagnostic.path}: ${diagnostic.message}`).join('; ')}`)
        return manifest
      },
    })
    provide(this.container, compatKey, {
      metadata: { kind: 'plugin-node', node: 'compat' },
      dependsOn: { manifest: packageKey },
      build: ({ dependsOn }) => {
        this.host.assertCompatible(dependsOn.manifest, runtime)
        return dependsOn.manifest
      },
    })
    provide(this.container, runtimeKey, {
      metadata: { kind: 'plugin-node', node: 'runtime', runner: runner.kind },
      dependsOn: { manifest: compatKey },
      build: async ({ setStatus, on }) => {
        const handle = await runner.open({ manifest, cwd: this.input.cwd, runtime, extension: this.input.extension, host: this })
        this.passesValues = handle.passesValues
        let closed = false
        const stopListening = handle.onExit((exit) => {
          if (closed)
            return
          const reason = exit.error !== undefined
            ? `The plugin runtime exited: ${errorMessageFrom(exit.error) ?? 'unknown error'}`
            : `The plugin runtime exited with code ${exit.code ?? 'unknown'}.`
          setStatus('unavailable', { reason })
          this.host.changed()
        })
        on('stop', async () => {
          closed = true
          stopListening()
          await handle.close()
        })
        try {
          await handle.endpoint.load({ manifestId: manifest.id })
        }
        catch (error) {
          closed = true
          stopListening()
          await handle.close()
          throw error
        }
        return { handle }
      },
    })
    this.sessionRegistration = provide(this.container, defineKey<unknown>(pluginNodeKeys.session), this.sessionOption())

    void start(this.container).catch(() => undefined)
  }

  /** All Kit uses of the session: the Manifest uses and the stored dynamic uses. */
  uses(): readonly NormalizedKitUse[] {
    const uses = new Map<string, NormalizedKitUse>()
    for (const use of this.host.dependencyStore.get(this.pluginId))
      uses.set(use.id, use)
    for (const use of this.staticUses)
      uses.set(use.id, use)
    return [...uses.values()]
  }

  private sessionOption(): ProvideOptionWithKeys<{ round: string }, DependencyDeclarations> {
    const dependsOn: DependencyDeclarations = { runtime: pluginNodeKeys.runtime }
    for (const use of this.uses())
      dependsOn[kitSelectionKey(use.id, use.range)] = this.host.kits.dependencyOf(use)
    return {
      metadata: { kind: 'plugin-node', node: 'session', uses: this.uses().map(use => ({ ...use })) },
      dependsOn,
      build: context => this.buildRound(context),
    }
  }

  private buildRound(context: BuildContext<Record<string, unknown>>): { round: string } {
    const { dependsOn, instanceId, on } = context
    const runtime = dependsOn.runtime as RuntimeValue
    const round: HostRound = {
      id: instanceId,
      phase: 'setting-up',
      deps: selectedKitsOf(dependsOn),
      provides: new Map(),
      exportStatus: new Map(),
      watchers: new Set(),
      scopes: new Set(),
      unsubscribe: [],
    }
    this.rounds.set(round.id, round)
    this.subscribeRound(round, runtime)
    context.effect(() => () => {
      for (const unsubscribe of round.unsubscribe.splice(0))
        unsubscribe()
    })

    on('start', ({ signal, decide }) => this.runSetup(round, runtime, signal, decide))
    on('stop', async ({ signal }) => {
      await this.cleanupRound(round, runtime, signal)
    })
    on('dependency-change', ({ dependsOn: current, decide }) => {
      round.deps = selectedKitsOf(current)
      this.subscribeRound(round, runtime)
      void this.pushKits(round, runtime)
      return decide.handled()
    })
    on('dependency-status-change', ({ decide }) => {
      void this.pushKits(round, runtime)
      return decide.handled()
    })
    return { round: round.id }
  }

  private subscribeRound(round: HostRound, runtime: RuntimeValue): void {
    for (const unsubscribe of round.unsubscribe.splice(0))
      unsubscribe()
    for (const selected of round.deps.values())
      round.unsubscribe.push(selected.onChange(() => void this.pushKits(round, runtime)))
  }

  private statusOf(container: Container, key: string): KitStatus {
    const result = peek(container, key)
    if (result.kind === 'resolved')
      return result.status
    return 'unavailable'
  }

  private snapshots(kits: ReadonlyMap<string, SelectedKit>, container: Container = this.container): KitSnapshot[] {
    return [...kits.values()].map(selected => selected.snapshot(this.statusOf(container, selected.key), this.passesValues))
  }

  private async pushKits(round: HostRound, runtime: RuntimeValue): Promise<void> {
    if (round.phase === 'stopped')
      return
    try {
      await runtime.handle.endpoint.updateKits({ round: round.id, kits: this.snapshots(round.deps) })
    }
    catch {
      // The runtime can end during the push. The next round gets the snapshot at its start.
    }
  }

  private async runSetup(round: HostRound, runtime: RuntimeValue, signal: AbortSignal, decide: DecideFor<'start'>): Promise<unknown> {
    const endpoint = runtime.handle.endpoint
    const firstRound = this.exportsOwner === undefined
    const tx = transaction(this.container)
    if (firstRound) {
      for (const declaration of this.provides)
        tx.declare(kitProviderKey(declaration.id, this.pluginId), { dependsOn: { runtime: pluginNodeKeys.runtime } })
    }

    const aborted = new Promise<'aborted'>((resolveAbort) => {
      if (signal.aborted)
        resolveAbort('aborted')
      signal.addEventListener('abort', () => resolveAbort('aborted'), { once: true })
    })
    const end = async (reason: string) => {
      round.ended ??= reason
      await tx.abort()
      void endpoint.abortRound({ round: round.id, reason }).catch(() => undefined)
      return decide.stop({ reason })
    }

    let outcome: 'done' | 'aborted'
    try {
      outcome = await Promise.race([
        endpoint.startRound({
          round: round.id,
          identity: { id: this.pluginId, version: this.input.manifest.version, sessionId: this.sessionId },
          kits: this.snapshots(round.deps),
          catalog: this.host.catalogFor(this),
          provides: this.provides,
        }).then(() => 'done' as const),
        aborted,
      ])
    }
    catch (error) {
      if (signal.aborted || (round.ended !== undefined && round.failure === undefined))
        return await end(round.ended ?? 'The setup round ended.')
      await tx.abort()
      return decide.fail(await this.failRound(round, runtime, round.failure ?? error))
    }

    if (outcome === 'aborted' || signal.aborted)
      return await end(this.stopping !== undefined ? 'The session stopped.' : 'A newer session superseded the setup round.')
    if (round.ended !== undefined && round.failure === undefined)
      return await end(round.ended)
    if (round.failure !== undefined) {
      await tx.abort()
      return decide.fail(await this.failRound(round, runtime, round.failure))
    }

    for (const declaration of this.provides) {
      const entry = round.provides.get(declaration.id)
      if (!entry || entry.withdrawn) {
        await tx.abort()
        return decide.fail(await this.failRound(round, runtime, new KitProviderRegistrationError('missing-declared-kit', declaration.id, this.pluginId, this.sessionId)))
      }
      const key = defineKey<KitProviderValue>(kitProviderKey(declaration.id, this.pluginId))
      const option = this.exportOption(round, entry, declaration)
      if (firstRound)
        this.exportRegistrations.set(declaration.id, tx.provide(key, option))
      else
        tx.replace(key, option)
    }

    try {
      await tx.commit()
    }
    catch (error) {
      await tx.abort()
      return decide.fail(await this.failRound(round, runtime, error))
    }
    if (signal.aborted)
      return decide.stop({ reason: 'A newer session superseded the setup round.' })

    this.exportsOwner = round.id
    this.rebuildsInRow = 0
    round.phase = 'ready'
    this.host.changed()
    return decide.handled()
  }

  /**
   * Cleans a round whose setup failed. It runs in the `start` hook, so no `stop` signal exists.
   * A stop from such a cleanup does not wait for it, because injeca does not wait for a `start` hook in progress.
   */
  private async failRound(round: HostRound, runtime: RuntimeValue, error: unknown): Promise<unknown> {
    try {
      await this.cleanupRound(round, runtime, undefined)
    }
    catch (cleanupError) {
      return new AggregateError([error, cleanupError], `Extension \`${this.pluginId}\` setup and cleanup both failed.`, { cause: error })
    }
    return error
  }

  private exportOption(round: HostRound, entry: ProvideEntry, declaration: ExtensionProvidedKitDeclaration): ProvideOptionWithKeys<KitProviderValue, { runtime: string }> {
    const { kitId, version, methods } = entry.input
    const pluginId = this.pluginId
    // The proxy is one service for all consumers. The `perConsumer` selection service connects a client for each caller.
    return {
      export: true,
      metadata: Object.freeze({
        kind: 'kit',
        kitId,
        version,
        exposure: declaration.exposure,
        provider: Object.freeze({ kind: 'extension', id: pluginId }),
        sessionId: this.sessionId,
      }),
      dependsOn: { runtime: pluginNodeKeys.runtime },
      build: ({ dependsOn, instanceId, setStatus }) => {
        round.exportStatus.set(kitId, setStatus)
        const endpoint = (dependsOn.runtime as RuntimeValue).handle.endpoint
        return createKitProviderValue({
          kitId,
          version,
          provider: { kind: 'extension', id: pluginId },
          instanceId,
          connect: caller => Object.freeze(Object.fromEntries(methods.map(method => [method, (input: unknown) => endpoint.invokeProvider({
            round: round.id,
            kitId,
            method,
            input,
            caller: { consumerExtensionId: caller.extensionId, consumerSessionId: caller.sessionId, consumerModuleId: caller.moduleId },
          })]))),
        })
      },
    }
  }

  /**
   * Runs the cleanup of one round once. A final stop withdraws the provided Kits and the dynamic modules first.
   * A round that a newer round replaced keeps them, because the newer round owns them.
   * `signal` is the signal of the `stop` hook that runs the cleanup. The withdrawals and the plugin-side cleanup get it, so a re-entrant call from them resolves at once.
   */
  private cleanupRound(round: HostRound, runtime: RuntimeValue, signal: AbortSignal | undefined): Promise<void> {
    round.cleaned ??= (async () => {
      round.phase = 'stopped'
      round.ended ??= 'The round stopped.'
      const errors: unknown[] = []
      const finalStop = this.exportsOwner === round.id || (this.exportsOwner === undefined && this.stopping !== undefined)
      if (finalStop) {
        for (const registration of [...this.exportRegistrations.values()].reverse()) {
          try {
            await registration.withdraw({ signal })
          }
          catch (error) {
            errors.push(error)
          }
        }
        this.exportRegistrations.clear()
        this.exportsOwner = undefined
        for (const module of this.dynamicModules.values()) {
          try {
            await module.registration?.withdraw({ signal })
          }
          catch (error) {
            errors.push(error)
          }
        }
        this.dynamicModules.clear()
      }
      for (const watcher of round.watchers) {
        try {
          await watcher.withdraw()
        }
        catch (error) {
          errors.push(error)
        }
      }
      round.watchers.clear()
      try {
        await this.runPluginCleanup(runtime.handle.endpoint, signal, cleanup => runtime.handle.endpoint.stopRound({ round: round.id, cleanup }))
      }
      catch (error) {
        errors.push(error)
      }
      for (const scopeId of [...round.scopes].reverse()) {
        try {
          await this.disposeScope({ round: round.id, scope: scopeId })
        }
        catch (error) {
          errors.push(error)
        }
      }
      if (finalStop) {
        try {
          this.releaseBindings()
        }
        catch (error) {
          errors.push(error)
        }
      }
      this.rounds.delete(round.id)
      this.host.changed()
      errorsInto(errors, `Extension \`${this.pluginId}\` cleanup failed.`)
    })()
    return round.cleaned
  }

  /**
   * Runs one plugin-side cleanup with the signal of the injeca hook that runs it.
   *
   * A signal cannot cross the worker boundary, so the Host keeps it under a run id until the run ends.
   * The plugin side gives the callbacks of the run a signal of its own for the id. `ctx.self.stop({ signal })` sends the id back to `stopSession`.
   * When `signal` aborts, for example at the stop timeout, `abortCleanup` aborts the plugin-side signal with the same reason.
   * Without `signal`, the run still gets an id, but a stop from it has no signal.
   */
  private async runPluginCleanup(endpoint: PluginEndpoint, signal: AbortSignal | undefined, run: (cleanup: string) => Promise<void>): Promise<void> {
    const cleanup = `cleanup-${++this.nextCleanupRun}`
    if (!signal)
      return await run(cleanup)
    this.cleanupRuns.set(cleanup, signal)
    const forwardAbort = () => {
      // The run can end before the abort arrives. Then the plugin side ignores it.
      void endpoint.abortCleanup({ cleanup, reason: encodeError(signal.reason) }).catch(() => undefined)
    }
    const running = run(cleanup)
    if (signal.aborted)
      forwardAbort()
    else
      signal.addEventListener('abort', forwardAbort, { once: true })
    try {
      await running
    }
    finally {
      signal.removeEventListener('abort', forwardAbort)
      this.cleanupRuns.delete(cleanup)
    }
  }

  private releaseBindings(): void {
    for (const binding of this.host.bindings.listByOwner(this.sessionId)) {
      if (binding.state !== 'withdrawn')
        this.host.bindings.withdraw(this.sessionId, this.pluginId, binding.moduleId)
      this.host.bindings.unbind(this.sessionId, this.pluginId, binding.moduleId)
    }
  }

  /** The phase of the session. A serving round keeps the session `ready` while a replacement builds. */
  currentPhase(): ExtensionSessionPhase {
    if (this.stopped)
      return 'stopped'
    let phases: string[]
    try {
      phases = graph(this.container).services().filter(service => service.key === pluginNodeKeys.session && service.kind === 'service').map(service => service.phase)
    }
    catch {
      return 'stopped'
    }
    if (phases.includes('running'))
      return 'ready'
    for (const phase of ['building', 'starting', 'retrying', 'failed', 'pending', 'conflict', 'declared', 'stopping'] as const) {
      if (phases.includes(phase))
        return phaseOfService[phase]!
    }
    return 'stopped'
  }

  /** Why the session is not ready, or `undefined` when it is ready. */
  explain(): string | undefined {
    return this.explanationLines()?.join('\n')
  }

  /**
   * Why the session is not ready, in one line for each blocked node, or `undefined` when it is ready.
   * A Kit selection that waits gets its own line, because the selection holds the version range and its rejected providers.
   */
  explanationLines(): string[] | undefined {
    if (this.stopped)
      return undefined
    try {
      const explanation = graph(this.container).explain(pluginNodeKeys.session)
      if (explanation.phase === 'running')
        return undefined
      const lines = [describeExplanation(explanation)]
      for (const blocker of explanation.blockers) {
        if (blocker.kind === 'pending-dependency' && blocker.key.startsWith('kit:'))
          lines.push(describeExplanation(graph(this.container).explain(blocker.key)))
      }
      for (const node of [pluginNodeKeys.runtime, pluginNodeKeys.compat, pluginNodeKeys.package]) {
        const nodeExplanation = graph(this.container).explain(node)
        if (nodeExplanation.phase !== 'running')
          lines.push(describeExplanation(nodeExplanation))
      }
      return lines
    }
    catch {
      return undefined
    }
  }

  /**
   * Waits until setup completes, fails, or waits for Kits.
   * It resolves for a `ready` session and for a session that waits in `pending` for its Kits.
   * It rejects with the failure of setup or of the runtime.
   */
  settled(): Promise<void> {
    return new Promise((resolveSettled, rejectSettled) => {
      let done = false
      let stopObserving: (() => void) | undefined
      const finish = (action: () => void) => {
        if (done)
          return
        done = true
        stopObserving?.()
        action()
      }
      const failureOf = (key: string): unknown => {
        const explanation = graph(this.container).explain(key)
        if (explanation.phase !== 'failed')
          return undefined
        const blocker = explanation.blockers.find(candidate => candidate.kind === 'failed')
        return blocker && 'error' in blocker ? blocker.error : new Error(describeExplanation(explanation))
      }
      const check = () => {
        if (done)
          return
        if (this.stopping !== undefined) {
          finish(() => rejectSettled(new Error(`Extension session ${this.sessionId} stopped before setup completed.`)))
          return
        }
        for (const node of [pluginNodeKeys.package, pluginNodeKeys.compat, pluginNodeKeys.runtime, pluginNodeKeys.session]) {
          const failure = failureOf(node)
          if (failure !== undefined) {
            finish(() => rejectSettled(failure))
            return
          }
        }
        if (this.currentPhase() === 'ready') {
          finish(resolveSettled)
          return
        }
        if (this.currentPhase() === 'pending' && graph(this.container).explain(pluginNodeKeys.runtime).phase === 'running' && this.stablyBlocked(pluginNodeKeys.session, 0))
          finish(resolveSettled)
      }
      const stopWatching = observe(this.host.container, () => queueMicrotask(check))
      this.settleChecks.add(check)
      stopObserving = () => {
        stopWatching()
        this.settleChecks.delete(check)
      }
      queueMicrotask(check)
    })
  }

  /**
   * Tells whether a pending service waits for something that does not change by itself: a missing or rejected provider, or a failure.
   * A dependency that builds now does not count, so `settled()` does not resolve too early.
   */
  private stablyBlocked(key: string, depth: number): boolean {
    return this.stablyBlockedIn(this.container, key, depth)
  }

  private stablyBlockedIn(container: Container, key: string, depth: number): boolean {
    if (depth > 6)
      return false
    const explanation = graph(container).explain(key)
    if (explanation.phase === undefined || explanation.phase === 'failed' || explanation.phase === 'conflict')
      return true
    if (explanation.phase !== 'pending')
      return false
    if (explanation.blockers.length === 0)
      return false
    return explanation.blockers.every((blocker) => {
      switch (blocker.kind) {
        case 'missing-provider':
        case 'rejected-provider':
        case 'conflicting-dependency':
        case 'failed-dependency':
        case 'unavailable-dependency':
        case 'conflict':
        case 'failed':
          return true
        case 'pending-dependency':
          return this.stablyBlockedIn(container, blocker.key, depth + 1)
        default:
          return false
      }
    })
  }

  /**
   * Withdraws the provided Kits, then disposes the container. Each step runs even when an earlier one fails.
   * `signal` is the signal of the caller. A cleanup of this session passes its own signal, so the disposal does not wait for that cleanup.
   */
  async stop(signal?: AbortSignal): Promise<void> {
    this.stopping ??= Promise.resolve()
    for (const check of this.settleChecks)
      check()
    const errors: unknown[] = []
    for (const registration of [...this.exportRegistrations.values()].reverse()) {
      try {
        await registration.withdraw({ signal })
      }
      catch (error) {
        errors.push(error)
      }
    }
    try {
      await dispose(this.container, { signal })
    }
    catch (error) {
      errors.push(error)
    }
    try {
      this.releaseBindings()
    }
    catch (error) {
      errors.push(error)
    }
    this.stopped = true
    errorsInto(errors, `Extension \`${this.pluginId}\` stop failed.`)
  }

  /** Checks the permission of one consumer scope of this session. The selection key already holds the version range. */
  async checkKitAccess(kitId: string, moduleId: string | undefined): Promise<void> {
    const scope = moduleId === undefined ? undefined : this.scopes.get(moduleId)
    if (!(await this.allowsKit(kitId, scope)))
      throw new KitUnavailableError(kitId, 'permission-denied', `Extension \`${this.pluginId}\` has no grant for this Kit.`)
  }

  /** Returns `true` when the scope can use the Kit: a static use, an API grant, or a dynamic grant. */
  async allowsKit(kitId: string, scope?: ScopeRecord): Promise<boolean> {
    if (scope?.explicit)
      return this.host.permissions.grantAllows(scope.permissions, 'apis', 'invoke', kitId)
    if (this.staticUses.some(use => use.id === kitId))
      return true
    if (this.host.permissions.grantAllows(this.input.permissions.granted, 'apis', 'invoke', kitId))
      return true
    return await this.dynamicGrant(kitId)
  }

  /** Returns `true` when the plugin can see the Kit in `find()`. */
  canSeeKit(kitId: string): boolean {
    if (this.staticUses.some(use => use.id === kitId) || this.provides.some(declaration => declaration.id === kitId))
      return true
    if (this.host.permissions.grantAllows(this.input.permissions.granted, 'apis', 'invoke', kitId))
      return true
    const dynamic = this.input.manifest.permissions.kits?.dynamic
    return dynamic !== undefined && (dynamic.allow === undefined || dynamic.allow.some(pattern => matchKitPattern(pattern, kitId)))
  }

  private async dynamicGrant(kitId: string): Promise<boolean> {
    const dynamic = this.input.manifest.permissions.kits?.dynamic
    if (!dynamic)
      return false
    if (dynamic.allow && !dynamic.allow.some(pattern => matchKitPattern(pattern, kitId)))
      return false
    const stored = this.host.grantStore.get(this.pluginId, kitId)
    if (stored !== undefined)
      return stored
    const granted = await this.host.grantPolicy({ extensionId: this.pluginId, sessionId: this.sessionId, kitId })
    this.host.grantStore.set(this.pluginId, kitId, granted)
    return granted
  }

  private roundOf(id: string): HostRound {
    const round = this.rounds.get(id)
    if (!round)
      throw new ExtensionRoundEndedError(id, 'The round is not active.')
    return round
  }

  private containerOf(scope: string | undefined): Container {
    if (scope === undefined)
      return this.container
    const record = this.scopes.get(scope)
    if (!record)
      throw new Error(`Module scope \`${scope}\` is not registered.`)
    return record.container
  }

  // Host port

  async provide(input: ProvideAnnounceInput): Promise<{ handle: string }> {
    const round = this.roundOf(input.round)
    if (round.phase !== 'setting-up' || round.ended !== undefined)
      throw new KitProviderRegistrationError('provide-after-setup', input.kitId, this.pluginId, this.sessionId)
    const declaration = this.provides.find(candidate => candidate.id === input.kitId)
    let failure: KitProviderRegistrationError | undefined
    if (!declaration)
      failure = new KitProviderRegistrationError('undeclared-kit', input.kitId, this.pluginId, this.sessionId)
    else if (round.provides.has(input.kitId))
      failure = new KitProviderRegistrationError('duplicate-provide', input.kitId, this.pluginId, this.sessionId)
    else if (declaration.version !== input.version)
      failure = new KitProviderRegistrationError('kit-version-mismatch', input.kitId, this.pluginId, this.sessionId)
    else if (!input.allowedExposePolicies.includes(declaration.exposure))
      failure = new KitProviderRegistrationError('kit-exposure-mismatch', input.kitId, this.pluginId, this.sessionId)
    if (failure) {
      // The plugin side checks the same rules. A plugin that skips them fails its round.
      round.failure ??= failure
      throw failure
    }
    const handle = `${round.id}:${input.kitId}`
    round.provides.set(input.kitId, { handle, input, withdrawn: false })
    return { handle }
  }

  async withdrawProvide(input: { round: string, handle: string }): Promise<boolean> {
    const round = this.rounds.get(input.round)
    const entry = round && [...round.provides.values()].find(candidate => candidate.handle === input.handle)
    if (!round || !entry || entry.withdrawn)
      return false
    entry.withdrawn = true
    if (round.phase === 'setting-up')
      return true
    if (this.exportsOwner !== round.id)
      return false
    const registration = this.exportRegistrations.get(entry.input.kitId)
    this.exportRegistrations.delete(entry.input.kitId)
    return await registration?.withdraw() ?? false
  }

  async setStatus(input: { round: string, kitId: string, status: KitStatus, reason?: string, cause?: { key: string, status: KitStatus, reason?: string } }): Promise<void> {
    const setStatus = this.rounds.get(input.round)?.exportStatus.get(input.kitId)
    setStatus?.(input.status, {
      reason: input.reason,
      cause: input.cause ? { key: input.cause.key, owner: this.container.owner, status: input.cause.status, reason: input.cause.reason } : undefined,
    })
  }

  async callKit(input: { round: string, scope?: string, kitId: string, method: string, args: readonly unknown[] }): Promise<unknown> {
    const selected = this.selectedIn(input.round, input.scope, input.kitId)
    // A dotted method name reads nested members, for example `hooks.on`.
    const path = input.method.split('.')
    let receiver: unknown = selected.target
    for (const segment of path.slice(0, -1))
      receiver = receiver === null || receiver === undefined ? undefined : Reflect.get(receiver as object, segment)
    const method = receiver === null || receiver === undefined ? undefined : Reflect.get(receiver as object, path.at(-1)!)
    if (typeof method !== 'function')
      throw new KitUnavailableError(input.kitId, 'not-ready', `The Kit has no method \`${input.method}\`.`)
    const target = receiver
    return await Reflect.apply(method, target, [...input.args])
  }

  /**
   * The running selection of a Kit in a scope. A session dependency comes first.
   * Otherwise the first running selection of any range serves, because `tryUse` and a module scope `use` resolve one range for each Kit.
   */
  private selectedIn(roundId: string, scope: string | undefined, kitId: string): SelectedKit {
    const container = this.containerOf(scope)
    const dependency = scope === undefined ? this.rounds.get(roundId)?.deps.get(kitId)?.key : undefined
    let kind = 'missing'
    for (const key of dependency === undefined ? this.host.kits.selectionKeysOf(kitId) : [dependency]) {
      const result = peek(container, key)
      if (result.kind === 'resolved' && result.value instanceof SelectedKit)
        return result.value
      if (kind === 'missing')
        kind = result.kind
    }
    throw new KitUnavailableError(kitId, 'not-ready', `The Kit is ${kind}.`)
  }

  async useKit(input: { round: string, scope?: string, kitId: string, range: string }): Promise<KitSnapshot> {
    const round = this.roundOf(input.round)
    if (round.ended !== undefined)
      throw new ExtensionRoundEndedError(round.id, round.ended)
    if (input.scope !== undefined) {
      const result = await this.resolveNow(input.scope, input.kitId, input.range)
      if (!result.ok)
        throw new KitUnavailableError(input.kitId, result.reason, result.detail)
      return result.kit
    }

    const selected = round.deps.get(input.kitId)
    if (selected && satisfies(selected.version, input.range))
      return selected.snapshot(this.statusOf(this.container, selected.key), this.passesValues)

    // Discovery: the session does not depend on the Kit. A rebuild adds it, and this round ends.
    if (!(await this.allowsKit(input.kitId)))
      throw new KitUnavailableError(input.kitId, 'permission-denied', `Extension \`${this.pluginId}\` has no grant for this Kit.`)
    const uses = [...this.host.dependencyStore.get(this.pluginId).filter(use => use.id !== input.kitId), { id: input.kitId, range: input.range, optional: false }]
    await this.requestRebuild(round, uses)
    throw new ExtensionRoundEndedError(round.id, `The session found Kit \`${input.kitId}\` and rebuilds with it.`)
  }

  async tryUseKit(input: { round: string, scope?: string, kitId: string, range: string }): Promise<TryUseResult> {
    const round = this.roundOf(input.round)
    if (input.scope === undefined) {
      const selected = round.deps.get(input.kitId)
      if (selected && satisfies(selected.version, input.range))
        return { ok: true, kit: selected.snapshot(this.statusOf(this.container, selected.key), this.passesValues) }
    }
    return await this.resolveNow(input.scope, input.kitId, input.range)
  }

  /** Resolves a Kit in a scope now: a missing Kit fails at once, and a Kit with a provider gets a short wait. */
  private async resolveNow(scope: string | undefined, kitId: string, range: string): Promise<TryUseResult> {
    const container = this.containerOf(scope)
    if (!(await this.allowsKit(kitId, scope === undefined ? undefined : this.scopes.get(scope))))
      return { ok: false, reason: 'permission-denied' }
    const key = this.host.kits.selectionOf(kitId, range)
    const incompatible = this.host.kits.incompatibleProviders(kitId, range)
    if (incompatible)
      return { ok: false, reason: 'incompatible-version', detail: `The use needs ${range}, but the providers are: ${incompatible.map(provider => `${provider.id} ${provider.version}`).join(', ')}.` }
    if (peek(container, key).kind === 'missing')
      return { ok: false, reason: 'missing-kit' }
    let selected: unknown
    try {
      selected = (await resolve(container, { kit: key }, { signal: timeout(container, resolveNowTimeoutMs) })).kit
    }
    catch (error) {
      if (error instanceof KitUnavailableError)
        return { ok: false, reason: error.reason, detail: error.detail }
      return { ok: false, reason: 'not-ready', detail: errorMessageFrom(error) }
    }
    if (!(selected instanceof SelectedKit))
      return { ok: false, reason: 'not-ready' }
    return { ok: true, kit: selected.snapshot(this.statusOf(container, key), this.passesValues) }
  }

  async watchKit(input: { round: string, scope?: string, kitId: string, range: string, callback: (update: WatchUpdate) => void | Promise<void> }): Promise<() => Promise<void>> {
    const round = this.roundOf(input.round)
    const container = this.containerOf(input.scope)
    const emit = (update: WatchUpdate) => {
      void Promise.resolve(input.callback(update)).catch(() => undefined)
    }
    if (!(await this.allowsKit(input.kitId, input.scope === undefined ? undefined : this.scopes.get(input.scope)))) {
      emit({ available: false, reason: 'permission-denied' })
      return async () => {}
    }

    // injeca `watch` demands the consumer instance of the selection, also when the selection registers later.
    const key = this.host.kits.selectionOf(input.kitId, input.range)
    let last: string | undefined
    let stopMoves: (() => void) | undefined
    const report = (update: WatchUpdate) => {
      const signature = update.available ? `available:${update.kit.provider.id}:${update.kit.instanceId}:${update.kit.status}` : `missing:${update.reason}`
      if (signature === last)
        return
      last = signature
      emit(update)
    }
    const reportSelected = () => {
      const result = peek(container, key)
      if (result.kind === 'resolved' && result.value instanceof SelectedKit) {
        report({ available: true, kit: result.value.snapshot(result.status, this.passesValues) })
        return result.value
      }
      if (result.kind === 'unavailable')
        report({ available: false, reason: 'not-ready', detail: result.reason })
      return undefined
    }
    const stopWatching = watch(container, key, (state) => {
      stopMoves?.()
      stopMoves = undefined
      if (state.phase === 'running') {
        const selected = reportSelected()
        stopMoves = selected?.onChange(() => reportSelected())
        return
      }
      if (state.phase === undefined || state.phase === 'withdrawn') {
        report({ available: false, reason: 'missing-kit' })
        return
      }
      if (state.phase === 'failed') {
        const blocker = graph(container).explain(key).blockers.find(candidate => candidate.kind === 'failed')
        const error = blocker && 'error' in blocker ? blocker.error : undefined
        report(error instanceof KitUnavailableError
          ? { available: false, reason: error.reason, detail: error.detail }
          : { available: false, reason: 'not-ready', detail: errorMessageFrom(error) })
        return
      }
      // A consumer instance that builds now is not a change yet. One that waits for a missing provider is missing.
      // One whose providers all have a version outside the range is incompatible.
      queueMicrotask(() => {
        const explanation = graph(container).explain(key)
        if (explanation.phase !== 'pending' || !this.stablyBlockedIn(container, key, 0))
          return
        const incompatible = this.host.kits.incompatibleProviders(input.kitId, input.range)
        report(incompatible
          ? { available: false, reason: 'incompatible-version', detail: `The providers are: ${incompatible.map(provider => `${provider.id} ${provider.version}`).join(', ')}.` }
          : { available: false, reason: 'missing-kit' })
      })
    })
    const handle = {
      key,
      withdraw: async () => {
        stopMoves?.()
        stopWatching()
        return true
      },
    }
    round.watchers.add(handle)
    return async () => {
      round.watchers.delete(handle)
      await handle.withdraw()
    }
  }

  async rebuild(input: { round: string, uses: readonly NormalizedKitUse[] }): Promise<{ phase: 'setup' | 'running' }> {
    const round = this.roundOf(input.round)
    return await this.requestRebuild(round, input.uses)
  }

  /**
   * Replaces the session registration with new dynamic uses.
   * During setup, the current round ends. After setup, the old round serves until the new round runs.
   */
  private async requestRebuild(round: HostRound, uses: readonly NormalizedKitUse[]): Promise<{ phase: 'setup' | 'running' }> {
    const before = new Set(this.uses().map(use => use.id))
    const adds = uses.some(use => !before.has(use.id))
    if (adds && this.rebuildsInRow >= this.host.rebuildLimit) {
      const error = new ExtensionRebuildLimitError(this.pluginId, this.host.rebuildLimit)
      round.failure ??= error
      throw error
    }
    if (adds)
      this.rebuildsInRow += 1
    this.host.dependencyStore.set(this.pluginId, uses)
    const phase = round.phase === 'ready' ? 'running' : 'setup'
    if (phase === 'setup')
      round.ended ??= 'A rebuild started during setup.'
    void this.sessionRegistration?.replace(this.sessionOption()).catch(() => undefined)
    this.host.changed()
    return { phase }
  }

  async upsertModule(input: { round: string, moduleId: string, revision: number, kits: readonly NormalizedKitUse[], timeoutMs: number }): Promise<void> {
    const runtimeValue = peek(this.container, pluginNodeKeys.runtime)
    if (runtimeValue.kind !== 'resolved')
      throw new ModuleUpsertError('upsert-failed', input.moduleId, `The plugin runtime is ${runtimeValue.kind}.`)
    const endpoint = (runtimeValue.value as RuntimeValue).handle.endpoint
    let record = this.dynamicModules.get(input.moduleId)
    if (!record) {
      record = {}
      this.dynamicModules.set(input.moduleId, record)
    }
    record.pending?.abort(new ModuleUpsertError('upsert-superseded', input.moduleId, `A newer upsert of module \`${input.moduleId}\` superseded this one.`))
    const controller = new AbortController()
    record.pending = controller

    try {
      for (const use of input.kits) {
        if (!(await this.allowsKit(use.id)))
          throw new KitUnavailableError(use.id, 'permission-denied', `Module \`${input.moduleId}\` of extension \`${this.pluginId}\` has no grant for this Kit.`)
      }
      const dependsOn: DependencyDeclarations = { runtime: pluginNodeKeys.runtime }
      for (const use of input.kits)
        dependsOn[kitSelectionKey(use.id, use.range)] = this.host.kits.dependencyOf(use)

      try {
        await resolve(this.container, dependsOn, { signal: withTimeout(controller.signal, input.timeoutMs, this.container) })
      }
      catch (error) {
        if (controller.signal.aborted)
          throw controller.signal.reason
        if (error instanceof KitUnavailableError)
          throw error
        if (error instanceof WaitTimeoutError) {
          const lines = input.kits.filter(use => !use.optional).map(use => describeExplanation(graph(this.container).explain(kitSelectionKey(use.id, use.range))))
          throw new ModuleUpsertError('upsert-timeout', input.moduleId, `Module \`${input.moduleId}\` did not get its Kits in ${input.timeoutMs}ms. ${lines.join(' ')}`, { cause: error })
        }
        throw new ModuleUpsertError('upsert-failed', input.moduleId, `Module \`${input.moduleId}\` cannot resolve its Kits: ${errorMessageFrom(error) ?? 'unknown error'}`, { cause: error })
      }

      const revision = input.revision
      const option: ProvideOptionWithKeys<{ moduleId: string, revision: number }, DependencyDeclarations> = {
        metadata: { kind: 'plugin-module', moduleId: input.moduleId, revision, uses: input.kits.map(use => ({ ...use })) },
        dependsOn,
        build: ({ dependsOn: values, on }) => {
          const kits = selectedKitsOf(values)
          on('start', async ({ decide }) => {
            try {
              await endpoint.startModule({ round: input.round, moduleId: input.moduleId, revision, kits: this.snapshots(kits) })
            }
            catch (error) {
              return decide.fail(error)
            }
          })
          on('stop', async ({ signal }) => {
            await this.runPluginCleanup(endpoint, signal, cleanup => endpoint.stopModule({ moduleId: input.moduleId, revision, cleanup }))
          })
          return { moduleId: input.moduleId, revision }
        },
      }

      if (record.registration) {
        const replaced = await record.registration.replace(option, { signal: controller.signal })
        if (!replaced)
          throw new ModuleUpsertError('upsert-superseded', input.moduleId, `A newer upsert of module \`${input.moduleId}\` superseded this one.`)
      }
      else {
        record.registration = provide(this.container, moduleNodeKey(input.moduleId), option) as Registration<string, unknown, undefined>
        await new Promise<void>((resolveStarted, rejectStarted) => {
          const observer = { stop: () => {} }
          const check = () => {
            const explanation = graph(this.container).explain(moduleNodeKey(input.moduleId))
            if (explanation.phase === 'running') {
              observer.stop()
              resolveStarted()
            }
            else if (explanation.phase === 'failed') {
              observer.stop()
              const blocker = explanation.blockers.find(candidate => candidate.kind === 'failed')
              rejectStarted(blocker && 'error' in blocker ? blocker.error : new Error(describeExplanation(explanation)))
            }
          }
          observer.stop = observe(this.container, () => queueMicrotask(check))
          queueMicrotask(check)
        })
      }
      record.revision = revision
      this.host.changed()
    }
    catch (error) {
      void endpoint.dropModule({ moduleId: input.moduleId, revision: input.revision }).catch(() => undefined)
      throw error
    }
    finally {
      if (record.pending === controller)
        record.pending = undefined
    }
  }

  /**
   * Stops the session for `ctx.self.stop()`.
   * A call from a plugin-side cleanup run sends the id of the run. The Host passes the hook signal of that run, so injeca resolves it at once, and the stop continues.
   * Without an id, or with the id of a run that ended, the session stops without a signal.
   */
  async stopSession(input: { cleanup?: string }): Promise<void> {
    const signal = input.cleanup === undefined ? undefined : this.cleanupRuns.get(input.cleanup)
    await this.host.stopSession(this.sessionId, signal)
  }

  async registerScope(input: { round: string, moduleId: string, permissions?: ModulePermissionDeclaration, labels?: Record<string, string> }): Promise<{ scope: string, permissions: ModulePermissionGrant }> {
    const round = this.roundOf(input.round)
    if (round.ended !== undefined)
      throw new Error(`Extension session ${this.sessionId} is stopped and cannot register modules.`)
    if (this.scopes.has(input.moduleId))
      throw new Error(`Extension module \`${input.moduleId}\` is already registered for session ${this.sessionId}.`)
    const permissions = this.host.permissions.intersectGrant(this.input.permissions.granted, input.permissions ?? this.input.permissions.granted)
    const owner: OwnerRecord = { kind: 'module', pluginId: this.pluginId, sessionId: this.sessionId, moduleId: input.moduleId }
    const container = createContainer({ parent: this.container, owner })
    const record: ScopeRecord = { id: input.moduleId, round: round.id, container, permissions, explicit: input.permissions !== undefined, labels: input.labels }
    this.scopes.set(input.moduleId, record)
    round.scopes.add(input.moduleId)
    void start(container).catch(() => undefined)
    return { scope: input.moduleId, permissions }
  }

  async disposeScope(input: { round: string, scope: string }): Promise<void> {
    const record = this.scopes.get(input.scope)
    if (!record)
      return
    this.scopes.delete(input.scope)
    this.rounds.get(record.round)?.scopes.delete(input.scope)
    await dispose(record.container)
  }

  /** Ties one binding to a module scope, so that the scope disposal removes it. */
  bindToScope(scope: string, moduleId: string): void {
    const record = this.scopes.get(scope)
    if (!record)
      return
    effect(record.container, () => () => {
      const binding = this.host.bindings.get(moduleId)
      if (!binding)
        return
      if (binding.state !== 'withdrawn')
        this.host.bindings.withdraw(this.sessionId, this.pluginId, moduleId)
      this.host.bindings.unbind(this.sessionId, this.pluginId, moduleId)
    })
  }

  /** Returns `true` when the module scope is registered. */
  hasScope(scope: string): boolean {
    return this.scopes.has(scope)
  }

  /** The grant of a module scope, or of the session. */
  grantOf(scope?: string): ModulePermissionGrant | undefined {
    return scope === undefined ? this.input.permissions.granted : this.scopes.get(scope)?.permissions
  }

  /** Pushes a new catalog to the plugin side. */
  async pushCatalog(): Promise<void> {
    const runtimeValue = peek(this.container, pluginNodeKeys.runtime)
    if (runtimeValue.kind !== 'resolved')
      return
    try {
      await (runtimeValue.value as RuntimeValue).handle.endpoint.updateCatalog({ catalog: this.host.catalogFor(this) })
    }
    catch {
      // The runtime can end during the push. The next round gets the catalog at its start.
    }
  }
}
