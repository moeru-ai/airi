import type { TamagotchiToolRegistry } from '@proj-airi/plugin-sdk-tamagotchi/tools'
import type { ExtensionActivationPlan } from '@proj-airi/plugin-sdk/plugin-host'
import type {
  ExtensionDirectoryImportPlan,
  PluginHostDebugSnapshot,
  PluginRegistrySnapshot,
} from '@proj-airi/stage-shared/plugin-host'

import type {
  ExtensionAssetCookie,
  ExtensionAssetSession,
  ExtensionAssetSnapshotService,
} from '../features/static-assets'
import type { ExtensionHostService, SetupExtensionHostOptions } from '../types'
import type { SessionCleanupReport } from './managed-sessions'

import { dirname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { ExtensionHost, planExtensionActivation } from '@proj-airi/plugin-sdk/plugin-host'
import { Mutex } from 'async-mutex'
import { app, session as electronSession } from 'electron'

import { createExtensionAutoReloadFeature } from '../features/auto-reload'
import { createExtensionAssetService } from '../features/static-assets'
import { createBuiltInExtensionKitRuntime } from '../kits'
import { createExtensionHostConfigStore } from './config'
import { buildPluginHostDebugSnapshot } from './debug'
import { ExtensionDirectoryImporter } from './directory-import'
import { ManagedExtensionSessions } from './managed-sessions'
import {
  buildPluginRegistrySnapshot,
  createExtensionHostRegistry,
  createManifestForLoad,
  manifestIdOf,
  resolvePluginRuntimeEntrypointPath,
} from './registry'

const extensionAssetSessionTtlMs = 30 * 24 * 60 * 60 * 1000

/** Separates runtime failures from static Planner diagnostics. */
interface ActivationExecutionReport {
  plan: ExtensionActivationPlan
  loadedExtensionIds: string[]
  unloadedExtensionIds: string[]
  skippedExtensionIds: Array<{
    extensionId: string
    reason: 'required-provider-failed'
  }>
  failures: Array<{
    extensionId: string
    operation: 'load' | 'unload'
    owner?: 'runtime' | 'assets'
    error: unknown
    message: string
  }>
}

type ExtensionLoadResult
  = | { ok: true }
    | { ok: false, cleanup: SessionCleanupReport }

function createElectronExtensionAssetCookieAdapter() {
  return {
    async setCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.set({
        url: cookie.url,
        name: cookie.name,
        value: cookie.value,
        path: cookie.path,
        httpOnly: true,
        sameSite: 'no_restriction',
        secure: true,
        expirationDate: Math.floor(cookie.expiresAt / 1000),
      })
    },
    async removeCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.remove(cookie.url, cookie.name)
    },
  }
}

/**
 * Internal extension host bootstrap service used by the public `setupExtensionHost(...)` facade.
 *
 * Use when:
 * - `plugins/index.ts` needs a smaller orchestration layer with the same caller-facing API
 * - Host wiring should stay separate from config, registry, and snapshot helpers
 *
 * Expects:
 * - Consumers treat this as an internal bootstrap surface and keep the public facade unchanged
 * - `widgetsManager` is ready before startup begins
 *
 * Returns:
 * - The Host fields plus internal helpers for list/load/unload/inspect/dispose
 */
export interface ExtensionHostServiceInternal extends ExtensionHostService {
  /** Tamagotchi-owned extension tool registry used by IPC tool bridges. */
  tools: TamagotchiToolRegistry

  /**
   * Applies the main-process system activation state without changing enabled intent.
   *
   * A disabled system stops live sessions in Consumer-first order. Re-enabling the
   * system restores the persisted enabled set in Provider-first order.
   */
  setSystemEnabled: (enabled: boolean) => Promise<ActivationExecutionReport>

  /** Reads and validates one selected folder without executing Extension code. */
  prepareDirectoryImport: (sourcePath: string, securityScopedBookmark?: string) => Promise<ExtensionDirectoryImportPlan>

  /** Copies one reviewed folder into the managed registry and keeps it disabled. */
  commitDirectoryImport: (planId: string) => Promise<PluginRegistrySnapshot>

  /** Removes one pending folder import plan. */
  cancelDirectoryImport: (planId: string) => void

  /**
   * Lists the current extension registry snapshot.
   *
   * Use when:
   * - IPC callers need the latest discovered plugin entries and enablement state
   * - Host operations need a refreshed renderer-facing registry view
   *
   * Expects:
   * - Manifest discovery can be refreshed before the snapshot is built
   *
   * Returns:
   * - The latest extension registry snapshot for renderer consumption
   */
  list: () => Promise<PluginRegistrySnapshot>

  /**
   * Persists whether one plugin is enabled.
   *
   * Use when:
   * - Renderer controls toggle plugin enablement
   * - Host state must remember a known manifest path for a plugin name
   *
   * Expects:
   * - `payload.extensionId` matches a discovered or previously known extension
   * - `payload.path` is only needed when the manifest is not currently discoverable
   *
   * Returns:
   * - The updated extension registry snapshot after persistence
   */
  setEnabled: (payload: { extensionId: string, enabled: boolean, path?: string }) => Promise<PluginRegistrySnapshot>

  /**
   * Persists whether one loaded plugin should use auto-reload.
   *
   * Use when:
   * - Renderer controls toggle plugin file watching during development
   * - Host features need to resync optional watcher state after config changes
   *
   * Expects:
   * - `payload.extensionId` matches one extension entry in config or discovery state
   *
   * Returns:
   * - The updated extension registry snapshot after persistence
   */
  setAutoReload: (payload: { extensionId: string, enabled: boolean }) => Promise<PluginRegistrySnapshot>

  /**
   * Loads every plugin currently marked as enabled.
   *
   * Use when:
   * - App startup wants to restore persisted enabled plugins
   * - Renderer requests a bulk load after configuration changes
   *
   * Expects:
   * - Discovery state is current before load begins
   *
   * Returns:
   * - The extension registry snapshot after load attempts finish
   */
  loadEnabled: () => Promise<PluginRegistrySnapshot>

  /**
   * Loads one extension by manifest id.
   *
   * Use when:
   * - Renderer explicitly requests one plugin to start
   * - Host features need to restart a plugin after manifest or entrypoint changes
   *
   * Expects:
   * - `extensionId` resolves to a manifest entry in the current registry
   *
   * Returns:
   * - The extension registry snapshot after the load completes
   */
  load: (extensionId: string) => Promise<PluginRegistrySnapshot>

  /**
   * Stops one loaded extension by manifest id.
   *
   * Use when:
   * - Renderer explicitly requests one plugin to stop
   * - Host features need to stop a plugin before reload or disposal
   *
   * Expects:
   * - `extensionId` identifies an extension that may or may not currently be loaded
   *
   * Returns:
   * - The extension registry snapshot after unload bookkeeping completes
   */
  unload: (extensionId: string) => Promise<PluginRegistrySnapshot>

  /**
   * Builds the full extension host debug snapshot.
   *
   * Use when:
   * - Devtools need sessions, kits, bindings, capabilities, and rewritten asset URLs
   * - Host debugging needs a fresh runtime snapshot after registry refresh
   *
   * Expects:
   * - The host and extension asset service are both initialized
   *
   * Returns:
   * - The full debug snapshot exposed through plugin inspection IPC
   */
  inspect: () => Promise<PluginHostDebugSnapshot>

  /**
   * Returns the mounted base URL for plugin-served assets.
   *
   * Use when:
   * - Renderer code needs to construct extension asset URLs
   * - Snapshot consumers need the current loopback asset mount base
   *
   * Expects:
   * - The extension asset service may be started before this is called
   *
   * Returns:
   * - The current extension asset base URL, or an empty string when unavailable
   */
  getAssetBaseUrl: () => string

  /**
   * Disposes optional host features and asset hosting resources.
   *
   * Use when:
   * - Electron shutdown needs to stop extension-owned background work
   * - Tests need to release watchers and local asset servers deterministically
   *
   * Expects:
   * - Disposal may be called after partial startup or after prior plugin failures
   *
   * Returns:
   * - A promise that resolves after all cleanup attempts finish
   *
   * Failures:
   * - Rejects with the remaining failure or an AggregateError after all cleanup attempts finish
   */
  dispose: () => Promise<void>
}

/**
 * Builds the extracted Electron extension host bootstrap used by the public facade.
 *
 * Use when:
 * - The public extension service wants one internal bootstrap entrypoint
 * - Tests need direct access to the internal host bootstrap helper
 *
 * Expects:
 * - Electron `app.getPath('userData')` is available
 * - Extension manifests live under `<userData>/extensions/v1`
 *
 * Returns:
 * - The internal bootstrap service that powers the public extension-host IPC facade
 */
export async function setupExtensionHostServiceInternal(
  options: SetupExtensionHostOptions,
): Promise<ExtensionHostServiceInternal> {
  const log = useLogg('main/extension-host').useGlobalConfig()
  const extensionsRoot = join(app.getPath('userData'), 'extensions', 'v1')

  // Config
  const extensionConfig = createExtensionHostConfigStore()
  extensionConfig.setup()

  // Kit API, Host
  const builtInKitRuntime = createBuiltInExtensionKitRuntime(options)
  const airiVersion = app.getVersion()
  const host = new ExtensionHost({
    airiVersion,
    runtime: 'electron',
  })
  const activationMutex = new Mutex()
  let systemEnabled = true
  log.withFields({ extensionsRoot }).log('loading extension manifests')
  builtInKitRuntime.registerHostKits(host)

  // Extension registry and asset service
  const extensionRegistry = createExtensionHostRegistry({ extensionsRoot, log })
  const extensionAssetService = createExtensionAssetService({
    getManifestEntryByExtensionId: () => new Map(
      [...extensionRegistry.getManifestEntryByExtensionId()].map(([extensionId, entry]) => [
        extensionId,
        {
          rootDir: entry.rootDir,
          version: entry.manifest.version,
        },
      ]),
    ),
    cookieAdapter: createElectronExtensionAssetCookieAdapter(),
  })

  const moduleAssetSessionCache = new Map<string, ExtensionAssetSession>()

  const clearModuleAssetSessionCacheByExtensionId = (extensionId: string) => {
    for (const key of moduleAssetSessionCache.keys()) {
      if (key.startsWith(`${extensionId}:`)) {
        moduleAssetSessionCache.delete(key)
      }
    }
  }

  const managedSessions = new ManagedExtensionSessions({
    stopRuntime: async (sessionId) => {
      await host.stop(sessionId)
    },
    revokeAssets: async (sessionId) => {
      await extensionAssetService.revokeByOwnerSessionId(sessionId)
    },
  })
  const getLoadedExtensionIds = () => managedSessions.snapshot().loadedExtensionIds
  const getLoadedExtensionIdSet = () => new Set(getLoadedExtensionIds())
  const getLoadedManifests = () => managedSessions.snapshot().loadedManifests

  const directoryImporter = new ExtensionDirectoryImporter(
    extensionsRoot,
    extensionId => Boolean(extensionRegistry.findManifestEntry(extensionId)) || managedSessions.hasOwnership(extensionId),
    (bookmark) => {
      const stopAccessing = app.startAccessingSecurityScopedResource(bookmark)
      return () => stopAccessing()
    },
  )
  await directoryImporter.initialize()

  await extensionRegistry.refresh()
  log.withFields({ count: extensionRegistry.listEntries().length }).log('extension manifests loaded')
  for (const entry of extensionRegistry.listEntries()) {
    log.withFields({ name: manifestIdOf(entry.manifest), path: entry.path }).log('extension manifest found')
  }
  await extensionAssetService.start()

  const refreshManifests = async () => {
    await extensionRegistry.refresh()
  }

  const getConfig = () => extensionConfig.get()

  const planActivation = (
    proposedEnabledExtensionIds: readonly string[],
    restartExtensionIds: readonly string[] = [],
    proposedSystemEnabled = systemEnabled,
  ) => {
    const result = planExtensionActivation({
      installedManifests: extensionRegistry.listManifests(),
      loadedManifests: getLoadedManifests(),
      proposedEnabledExtensionIds,
      restartExtensionIds,
      hostProvidedKits: builtInKitRuntime.hostProvidedKits,
      runtime: 'electron',
      airiVersion,
      systemEnabled: proposedSystemEnabled,
    })
    if (!result.ok) {
      throw new Error(result.diagnostics.map(diagnostic => diagnostic.message).join('\n'))
    }
    return result.plan
  }

  const listSnapshot = (): PluginRegistrySnapshot => {
    return buildPluginRegistrySnapshot({
      extensionsRoot,
      entries: extensionRegistry.listEntries(),
      config: getConfig(),
      loaded: getLoadedExtensionIdSet(),
    })
  }

  const createModuleAssetSession = async (input: {
    extensionId: string
    version: string
    ownerSessionId: string
    routeAssetPath: string
    pathPrefix: string
  }) => {
    const { extensionId, version, ownerSessionId, routeAssetPath, pathPrefix } = input
    const cacheKey = `${extensionId}:${version}:${ownerSessionId}:${routeAssetPath}:${pathPrefix}`
    const cachedSession = moduleAssetSessionCache.get(cacheKey)
    if (cachedSession) {
      return cachedSession
    }

    const session = await extensionAssetService.createAssetSession({
      extensionId,
      version,
      ownerSessionId,
      routeAssetPath,
      pathPrefix,
      ttlMs: extensionAssetSessionTtlMs,
    })
    moduleAssetSessionCache.set(cacheKey, session)
    return session
  }

  const extensionAssetSnapshotService: ExtensionAssetSnapshotService = {
    getBaseUrl: extensionAssetService.getBaseUrl,
    createAssetSession: ({ extensionId, version, ownerSessionId, routeAssetPath, pathPrefix }) => {
      return createModuleAssetSession({
        extensionId,
        version,
        ownerSessionId,
        routeAssetPath,
        pathPrefix,
      })
    },
  }

  const inspectSnapshot = async (): Promise<PluginHostDebugSnapshot> => {
    return await buildPluginHostDebugSnapshot({
      host,
      extensionsRoot,
      entries: extensionRegistry.listEntries(),
      config: getConfig(),
      loaded: getLoadedExtensionIdSet(),
      manifestEntryByExtensionId: extensionRegistry.getManifestEntryByExtensionId(),
      extensionAssetService: extensionAssetSnapshotService,
      canMaterializeAssetSession: ({ extensionId, sessionId }) => {
        return managedSessions.isLoadedSession(extensionId, sessionId)
      },
    })
  }

  const loadExtensionById = async (
    extensionId: string,
    loadOptions: { cacheBustKey?: string } = {},
  ): Promise<ExtensionLoadResult> => {
    const preparation = await managedSessions.prepareForLoad(extensionId)
    if (preparation === 'already-loaded') {
      return { ok: true }
    }
    if (preparation !== 'ready') {
      return { ok: false, cleanup: preparation }
    }

    const entry = extensionRegistry.findManifestEntry(extensionId)
    if (!entry) {
      throw new Error(`Extension manifest not found: ${extensionId}`)
    }

    const manifestForLoad = createManifestForLoad(entry, loadOptions)
    const session = await host.start(manifestForLoad, { cwd: dirname(entry.path) })
    managedSessions.registerLoaded({
      extensionId,
      sessionId: session.id,
      manifest: manifestForLoad,
    })
    log.withFields({ extensionId, sessionId: session.id }).log('extension loaded')
    return { ok: true }
  }

  const stopLoadedExtensionById = async (extensionId: string) => {
    // The module asset cache is a synchronous local projection. It does not own
    // retryable cleanup work, so clear it before the session state transition.
    clearModuleAssetSessionCacheByExtensionId(extensionId)
    const report = await managedSessions.cleanup(extensionId)
    if (report.complete) {
      log.withFields({ extensionId }).log('extension unloaded')
    }
    return report
  }

  let autoReloadFeature: ReturnType<typeof createExtensionAutoReloadFeature>

  const unloadExtensionById = async (extensionId: string) => {
    autoReloadFeature.clearExtension(extensionId)
    return await stopLoadedExtensionById(extensionId)
  }

  const executeActivationPlan = async (
    plan: ExtensionActivationPlan,
    options: { cacheBustKey?: string, rejectOnFailure?: boolean } = {},
  ): Promise<ActivationExecutionReport> => {
    const report: ActivationExecutionReport = {
      plan,
      loadedExtensionIds: [],
      unloadedExtensionIds: [],
      skippedExtensionIds: [],
      failures: [],
    }
    const failedExtensionIds = new Set<string>()
    const runtimeFailures: unknown[] = []
    const executeUnload = async (extensionId: string) => {
      try {
        const cleanupReport: SessionCleanupReport = await unloadExtensionById(extensionId)
        if (cleanupReport.complete) {
          report.unloadedExtensionIds.push(extensionId)
          return
        }

        failedExtensionIds.add(extensionId)
        for (const failure of cleanupReport.failures) {
          runtimeFailures.push(failure.error)
          report.failures.push({
            extensionId,
            operation: 'unload',
            owner: failure.owner,
            error: failure.error,
            message: errorMessageFrom(failure.error) ?? 'Unknown Extension unload failure.',
          })
          log.withError(failure.error).withFields({ extensionId, owner: failure.owner }).error('extension failed to stop')
        }
      }
      catch (error) {
        runtimeFailures.push(error)
        failedExtensionIds.add(extensionId)
        report.failures.push({
          extensionId,
          operation: 'unload',
          error,
          message: errorMessageFrom(error) ?? 'Unknown Extension unload failure.',
        })
        log.withError(error).withFields({ extensionId }).error('extension failed to stop')
      }
    }
    for (const extensionId of plan.unloadOrder) {
      await executeUnload(extensionId)
    }

    // Cleanup debt is intentionally absent from the Planner's loaded snapshot.
    // Retry owners that are also absent from the target state after planned stops.
    const targetLoadedExtensionIdSet = new Set(plan.targetLoadedExtensionIds)
    const plannedUnloadExtensionIdSet = new Set(plan.unloadOrder)
    const pendingCleanupExtensionIds = managedSessions.snapshot().cleanupPendingExtensionIds.filter(extensionId => !targetLoadedExtensionIdSet.has(extensionId)).filter(extensionId => !plannedUnloadExtensionIdSet.has(extensionId))
    for (const extensionId of pendingCleanupExtensionIds) {
      await executeUnload(extensionId)
    }

    for (const extensionId of plan.loadOrder) {
      if (failedExtensionIds.has(extensionId)) {
        log.withFields({ extensionId }).error('extension restart skipped because stop failed')
        continue
      }
      const unavailableProviderIds = plan.resolutions
        .filter(resolution => resolution.consumerExtensionId === extensionId && !resolution.optional)
        .flatMap((resolution) => {
          if (resolution.provider.kind !== 'extension') {
            return []
          }
          return failedExtensionIds.has(resolution.provider.extensionId)
            ? [resolution.provider.extensionId]
            : []
        })
      if (unavailableProviderIds.length > 0) {
        failedExtensionIds.add(extensionId)
        report.skippedExtensionIds.push({
          extensionId,
          reason: 'required-provider-failed',
        })
        log.withFields({ extensionId, unavailableProviderIds }).error('extension start skipped because a required Provider failed')
        continue
      }

      try {
        const loadResult = await loadExtensionById(extensionId, options)
        if (!loadResult.ok) {
          failedExtensionIds.add(extensionId)
          for (const failure of loadResult.cleanup.failures) {
            runtimeFailures.push(failure.error)
            report.failures.push({
              extensionId,
              operation: 'load',
              owner: failure.owner,
              error: failure.error,
              message: errorMessageFrom(failure.error) ?? 'Unknown Extension cleanup failure before load.',
            })
            log.withError(failure.error).withFields({ extensionId, owner: failure.owner }).error('extension cleanup failed before start')
          }
          continue
        }
        report.loadedExtensionIds.push(extensionId)
      }
      catch (error) {
        runtimeFailures.push(error)
        failedExtensionIds.add(extensionId)
        report.failures.push({
          extensionId,
          operation: 'load',
          error,
          message: errorMessageFrom(error) ?? 'Unknown Extension load failure.',
        })
        log.withError(error).withFields({ extensionId }).error('extension failed to start')
      }
    }

    if (report.failures.length > 0 || report.skippedExtensionIds.length > 0) {
      log.withFields({ report }).error('extension activation finished with runtime failures')
    }

    if (options.rejectOnFailure) {
      if (runtimeFailures.length === 1) {
        throw runtimeFailures[0]
      }
      if (runtimeFailures.length > 1) {
        throw new AggregateError(runtimeFailures, 'Extension activation failed.')
      }
    }

    return report
  }

  const resolveAutoReloadWatchPaths = (extensionId: string) => {
    const entry = extensionRegistry.findManifestEntry(extensionId)
    if (!entry) {
      return []
    }

    const entrypointPath = resolvePluginRuntimeEntrypointPath(entry)
    return [...new Set([entry.path, entrypointPath].filter((path): path is string => Boolean(path)))]
  }

  // Extension feature: Auto-reload for plugins
  autoReloadFeature = createExtensionAutoReloadFeature({
    log,
    getConfig,
    listEntries: () => extensionRegistry.listEntries(),
    isLoaded: extensionId => managedSessions.isLoaded(extensionId),
    resolveWatchPaths: resolveAutoReloadWatchPaths,
    reload: async (extensionId) => {
      await activationMutex.runExclusive(async () => {
        await refreshManifests()
        const plan = planActivation(getLoadedExtensionIds(), [extensionId])
        await executeActivationPlan(plan, { cacheBustKey: `auto-reload-${Date.now()}` })
        autoReloadFeature.sync()
      })
    },
  })

  const loadEnabledExtensions = async () => {
    const config = getConfig()
    const plan = planActivation(config.enabled)
    // loadEnabled reconciles persisted intent without undoing Devtools raw loads.
    // Raw-loaded sessions are runtime facts, so this operation ignores planned unloads.
    const loadOnlyPlan: ExtensionActivationPlan = {
      ...plan,
      unloadOrder: [],
    }
    const report = await executeActivationPlan(loadOnlyPlan)
    autoReloadFeature.sync()
    return report
  }

  await activationMutex.runExclusive(async () => {
    await refreshManifests()
    try {
      await loadEnabledExtensions()
    }
    catch (error) {
      log.withError(error).error('extension activation plan rejected during startup')
    }
  })
  autoReloadFeature.sync()

  return {
    host,
    // REVIEW: Tool registry ownership is currently hidden inside the built-in kit runtime even though
    // the host service also exposes it for IPC listing/invocation. Consider moving registry ownership
    // to this host service and passing it into kit registration as a dependency.
    tools: builtInKitRuntime.tools,
    manifests: extensionRegistry.listManifests(),
    async prepareDirectoryImport(sourcePath, securityScopedBookmark) {
      await refreshManifests()
      return await directoryImporter.prepare(sourcePath, securityScopedBookmark)
    },
    async commitDirectoryImport(planId) {
      await refreshManifests()
      const imported = await directoryImporter.commit(planId)
      extensionRegistry.recordCommittedEntry(imported)

      const config = getConfig()
      extensionConfig.update({
        enabled: config.enabled.filter(extensionId => extensionId !== imported.manifest.id),
        autoReload: config.autoReload.filter(extensionId => extensionId !== imported.manifest.id),
        known: {
          ...config.known,
          [imported.manifest.id]: { path: imported.path },
        },
      })

      autoReloadFeature.sync()
      return listSnapshot()
    },
    cancelDirectoryImport(planId) {
      directoryImporter.cancel(planId)
    },
    async list() {
      await refreshManifests()
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async setEnabled(payload) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()

        const config = getConfig()
        const enabled = new Set(config.enabled)
        if (payload.enabled) {
          enabled.add(payload.extensionId)
        }
        else {
          enabled.delete(payload.extensionId)
        }

        planActivation([...enabled])

        const entry = extensionRegistry.findManifestEntry(payload.extensionId)
        const manifestPath = entry?.path ?? payload.path ?? ''
        extensionConfig.update({
          enabled: [...enabled],
          autoReload: config.autoReload,
          known: {
            ...config.known,
            [payload.extensionId]: { path: manifestPath },
          },
        })

        if (!payload.enabled) {
          clearModuleAssetSessionCacheByExtensionId(payload.extensionId)
          await extensionAssetService.revokeByExtensionId(payload.extensionId)
        }

        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async setAutoReload(payload) {
      await refreshManifests()

      const config = getConfig()
      const autoReload = new Set(config.autoReload)
      if (payload.enabled) {
        autoReload.add(payload.extensionId)
      }
      else {
        autoReload.delete(payload.extensionId)
      }

      extensionConfig.update({
        ...config,
        autoReload: [...autoReload],
      })

      autoReloadFeature.sync()
      return listSnapshot()
    },
    async loadEnabled() {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        await loadEnabledExtensions()
        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async load(extensionId) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        const plan = planActivation([...getLoadedExtensionIds(), extensionId])
        await executeActivationPlan(plan, { rejectOnFailure: true })
        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async unload(extensionId) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        const proposedLoadedExtensionIds = getLoadedExtensionIds()
          .filter(loadedExtensionId => loadedExtensionId !== extensionId)
        const plan = planActivation(proposedLoadedExtensionIds)
        await executeActivationPlan(plan, { rejectOnFailure: true })
        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async setSystemEnabled(enabled) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        const plan = planActivation(getConfig().enabled, [], enabled)
        systemEnabled = enabled
        const report = await executeActivationPlan(plan)
        autoReloadFeature.sync()
        return report
      })
    },
    async inspect() {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        autoReloadFeature.sync()
        return await inspectSnapshot()
      })
    },
    getAssetBaseUrl() {
      return extensionAssetService.getBaseUrl() ?? ''
    },
    async dispose() {
      await activationMutex.runExclusive(async () => {
        const cleanupFailures: unknown[] = []
        const managedManifests = managedSessions.snapshot().ownedManifests
        const shutdownResult = planExtensionActivation({
          installedManifests: [],
          loadedManifests: managedManifests,
          proposedEnabledExtensionIds: [],
          hostProvidedKits: builtInKitRuntime.hostProvidedKits,
          runtime: 'electron',
          airiVersion,
          systemEnabled: false,
        })
        if (!shutdownResult.ok) {
          cleanupFailures.push(new Error(
            shutdownResult.diagnostics.map(diagnostic => diagnostic.message).join('\n'),
          ))
        }
        else {
          const report = await executeActivationPlan(shutdownResult.plan)
          for (const failure of report.failures) {
            cleanupFailures.push(failure.error)
          }
        }

        // Session cleanup runs first because Extension stop handlers can still use
        // Kit and asset services. Shared owners shut down even when a stop fails.
        try {
          await directoryImporter.dispose()
        }
        catch (error) {
          cleanupFailures.push(error)
        }
        try {
          autoReloadFeature.dispose()
        }
        catch (error) {
          cleanupFailures.push(error)
        }
        try {
          builtInKitRuntime.dispose()
        }
        catch (error) {
          cleanupFailures.push(error)
        }

        moduleAssetSessionCache.clear()
        try {
          await extensionAssetService.revokeAll()
        }
        catch (error) {
          cleanupFailures.push(error)
        }
        try {
          await extensionAssetService.stop()
        }
        catch (error) {
          cleanupFailures.push(error)
        }

        if (cleanupFailures.length === 1) {
          throw cleanupFailures[0]
        }
        if (cleanupFailures.length > 1) {
          throw new AggregateError(cleanupFailures, 'Extension Host disposal failed.')
        }
      })
    },
  }
}
