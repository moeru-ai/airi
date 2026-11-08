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
import type { TamagotchiToolRegistry } from '../kits/tool/registry'
import type { ExtensionHostService, SetupExtensionHostOptions } from '../types'
import type { SessionCleanupReport } from './managed-sessions'

import { dirname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { checkExtensionActivation } from '@proj-airi/plugin-sdk/plugin-host'
import { Mutex } from 'async-mutex'
import { app, session as electronSession } from 'electron'

import { createExtensionAutoReloadFeature } from '../features/auto-reload'
import { createExtensionAssetService } from '../features/static-assets'
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

/** Separates runtime failures from static activation check diagnostics. */
interface ActivationExecutionReport {
  loadedExtensionIds: string[]
  unloadedExtensionIds: string[]
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
 * - The built-in Kits are registered on `host` before startup begins
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
   * A disabled system stops live sessions in reverse start order. Re-enabling the
   * system starts the persisted enabled set. A Consumer waits for its required Kits.
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

  const { host, kits } = options
  const airiVersion = app.getVersion()
  const activationMutex = new Mutex()
  let systemEnabled = true
  log.withFields({ extensionsRoot }).log('loading extension manifests')

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

  const checkActivation = (enabledExtensionIds: readonly string[]) => {
    const diagnostics = checkExtensionActivation({
      installedManifests: extensionRegistry.listManifests(),
      enabledExtensionIds,
      runtime: 'electron',
      airiVersion,
    })
    if (diagnostics.length > 0) {
      throw new Error(diagnostics.map(diagnostic => diagnostic.message).join('\n'))
    }
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

  /** Stops `unload` in order, retries other cleanup debt, then starts `load` in order. */
  const executeActivation = async (
    transition: { unload?: readonly string[], load?: readonly string[] },
    options: { cacheBustKey?: string, rejectOnFailure?: boolean } = {},
  ): Promise<ActivationExecutionReport> => {
    const unloadExtensionIds = transition.unload ?? []
    const loadExtensionIds = transition.load ?? []
    const report: ActivationExecutionReport = {
      loadedExtensionIds: [],
      unloadedExtensionIds: [],
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
    for (const extensionId of unloadExtensionIds) {
      await executeUnload(extensionId)
    }

    // Cleanup debt is absent from the loaded snapshot. Retry owners that this transition neither stops nor starts.
    const { cleanupPendingExtensionIds } = managedSessions.snapshot()
    for (const extensionId of cleanupPendingExtensionIds.filter(id => !loadExtensionIds.includes(id) && !unloadExtensionIds.includes(id))) {
      await executeUnload(extensionId)
    }

    for (const extensionId of loadExtensionIds) {
      if (failedExtensionIds.has(extensionId)) {
        log.withFields({ extensionId }).error('extension restart skipped because stop failed')
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

    if (report.failures.length > 0) {
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
        if (!managedSessions.isLoaded(extensionId)) {
          throw new Error(`Extension "${extensionId}" cannot restart because it is not loaded.`)
        }
        checkActivation(getLoadedExtensionIds())
        await executeActivation({ unload: [extensionId], load: [extensionId] }, { cacheBustKey: `auto-reload-${Date.now()}` })
        autoReloadFeature.sync()
      })
    },
  })

  const loadEnabledExtensions = async () => {
    const config = getConfig()
    checkActivation(config.enabled)
    // loadEnabled reconciles persisted intent without undoing Devtools raw loads.
    // Raw-loaded sessions are runtime facts, so this operation stops nothing.
    const report = await executeActivation({
      load: systemEnabled ? config.enabled.filter(extensionId => !managedSessions.isLoaded(extensionId)) : [],
    })
    autoReloadFeature.sync()
    return report
  }

  await activationMutex.runExclusive(async () => {
    await refreshManifests()
    try {
      await loadEnabledExtensions()
    }
    catch (error) {
      log.withError(error).error('extension activation rejected during startup')
    }
  })
  autoReloadFeature.sync()

  return {
    host,
    tools: kits.tools,
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

        checkActivation([...enabled])

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
        checkActivation([...getLoadedExtensionIds(), extensionId])
        await executeActivation({ load: managedSessions.isLoaded(extensionId) ? [] : [extensionId] }, { rejectOnFailure: true })
        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async unload(extensionId) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        await executeActivation({ unload: managedSessions.isLoaded(extensionId) ? [extensionId] : [] }, { rejectOnFailure: true })
        autoReloadFeature.sync()
        return listSnapshot()
      })
    },
    async setSystemEnabled(enabled) {
      return await activationMutex.runExclusive(async () => {
        await refreshManifests()
        const config = getConfig()
        checkActivation(config.enabled)
        systemEnabled = enabled
        const targetExtensionIds = new Set(enabled ? config.enabled : [])
        const report = await executeActivation({
          unload: getLoadedExtensionIds().filter(extensionId => !targetExtensionIds.has(extensionId)).reverse(),
          load: [...targetExtensionIds].filter(extensionId => !managedSessions.isLoaded(extensionId)),
        })
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
        const report = await executeActivation({
          unload: managedSessions.snapshot().ownedManifests.map(manifest => manifest.id).reverse(),
        })
        for (const failure of report.failures) {
          cleanupFailures.push(failure.error)
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
