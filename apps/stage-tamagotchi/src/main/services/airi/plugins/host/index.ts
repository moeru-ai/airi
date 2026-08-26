import type { TamagotchiToolRegistry } from '@proj-airi/plugin-sdk-tamagotchi/tools'

import type {
  PluginHostDebugSnapshot,
  PluginRegistrySnapshot,
} from '../../../../../shared/eventa/plugin/host'
import type {
  ExtensionAssetCookie,
  ExtensionAssetSession,
  ExtensionAssetSnapshotService,
} from '../features/static-assets'
import type { ExtensionHostService, SetupExtensionHostOptions } from '../types'

import { dirname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { ExtensionHost } from '@proj-airi/plugin-sdk/plugin-host'
import { app, session as electronSession } from 'electron'

import { createExtensionAutoReloadFeature } from '../features/auto-reload'
import { createExtensionAssetService } from '../features/static-assets'
import { createBuiltInExtensionKitRuntime } from '../kits'
import { createExtensionHostConfigStore } from './config'
import { buildPluginHostDebugSnapshot } from './debug'
import {
  buildPluginRegistrySnapshot,
  createExtensionHostRegistry,
  createManifestForLoad,
  manifestIdOf,
  resolvePluginRuntimeEntrypointPath,
} from './registry'

const extensionAssetSessionTtlMs = 30 * 24 * 60 * 60 * 1000

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
 * - The plain `ExtensionHostService` fields plus internal helpers for list/load/unload/inspect/dispose
 */
export interface ExtensionHostServiceInternal extends ExtensionHostService {
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
   * - A promise that resolves after feature and asset cleanup finish
   */
  dispose: () => Promise<void>

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
  setAutoReload: (payload: { enabled: boolean, extensionId: string }) => Promise<PluginRegistrySnapshot>

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
  setEnabled: (payload: { enabled: boolean, extensionId: string, path?: string }) => Promise<PluginRegistrySnapshot>

  /** Tamagotchi-owned extension tool registry used by IPC tool bridges. */
  tools: TamagotchiToolRegistry

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
  const host = new ExtensionHost({ runtime: 'electron' })
  log.withFields({ extensionsRoot }).log('loading extension manifests')
  builtInKitRuntime.registerHostKits(host)

  // extension registry
  const extensionRegistry = createExtensionHostRegistry({ extensionsRoot, log })

  await extensionRegistry.refresh()
  log.withFields({ count: extensionRegistry.listEntries().length }).log('extension manifests loaded')
  for (const entry of extensionRegistry.listEntries()) {
    log.withFields({ name: manifestIdOf(entry.manifest), path: entry.path }).log('extension manifest found')
  }

  // Extension feature: Static Assets serving
  const extensionAssetService = createExtensionAssetService({
    cookieAdapter: createElectronExtensionAssetCookieAdapter(),
    getManifestEntryByExtensionId: () => extensionRegistry.getManifestEntryByExtensionId(),
  })
  await extensionAssetService.start()

  const loaded = new Set<string>()
  const loadedSessionIds = new Map<string, string>()
  const moduleAssetSessionCache = new Map<string, ExtensionAssetSession>()

  const clearModuleAssetSessionCacheByExtensionId = (extensionId: string) => {
    for (const key of moduleAssetSessionCache.keys()) {
      if (key.startsWith(`${extensionId}:`)) {
        moduleAssetSessionCache.delete(key)
      }
    }
  }

  const clearModuleAssetSessionCacheByOwnerSessionId = (ownerSessionId: string) => {
    for (const key of moduleAssetSessionCache.keys()) {
      const segments = key.split(':')
      if (segments[2] === ownerSessionId) {
        moduleAssetSessionCache.delete(key)
      }
    }
  }

  const refreshManifests = async () => {
    await extensionRegistry.refresh()
  }

  const getConfig = () => extensionConfig.get()

  const listSnapshot = (): PluginRegistrySnapshot => {
    return buildPluginRegistrySnapshot({
      config: getConfig(),
      entries: extensionRegistry.listEntries(),
      extensionsRoot,
      loaded,
    })
  }

  const createModuleAssetSession = async (input: {
    extensionId: string
    ownerSessionId: string
    pathPrefix: string
    routeAssetPath: string
    version: string
  }) => {
    const { extensionId, ownerSessionId, pathPrefix, routeAssetPath, version } = input
    const cacheKey = `${extensionId}:${version}:${ownerSessionId}:${routeAssetPath}:${pathPrefix}`
    const cachedSession = moduleAssetSessionCache.get(cacheKey)
    if (cachedSession) {
      return cachedSession
    }

    const session = await extensionAssetService.createAssetSession({
      extensionId,
      ownerSessionId,
      pathPrefix,
      routeAssetPath,
      ttlMs: extensionAssetSessionTtlMs,
      version,
    })
    moduleAssetSessionCache.set(cacheKey, session)
    return session
  }

  const extensionAssetSnapshotService: ExtensionAssetSnapshotService = {
    createAssetSession: ({ extensionId, ownerSessionId, pathPrefix, routeAssetPath, version }) => {
      return createModuleAssetSession({
        extensionId,
        ownerSessionId,
        pathPrefix,
        routeAssetPath,
        version,
      })
    },
    getBaseUrl: extensionAssetService.getBaseUrl,
  }

  const inspectSnapshot = async (): Promise<PluginHostDebugSnapshot> => {
    return await buildPluginHostDebugSnapshot({
      config: getConfig(),
      entries: extensionRegistry.listEntries(),
      extensionAssetService: extensionAssetSnapshotService,
      extensionsRoot,
      host,
      loaded,
      manifestEntryByExtensionId: extensionRegistry.getManifestEntryByExtensionId(),
    })
  }

  const loadExtensionById = async (
    extensionId: string,
    loadOptions: { cacheBustKey?: string } = {},
  ) => {
    if (loaded.has(extensionId)) {
      return
    }

    const entry = extensionRegistry.findManifestEntry(extensionId)
    if (!entry) {
      throw new Error(`Extension manifest not found: ${extensionId}`)
    }

    const manifestForLoad = createManifestForLoad(entry, loadOptions)
    const session = await host.start(manifestForLoad, { cwd: dirname(entry.path) })
    loaded.add(extensionId)
    loadedSessionIds.set(extensionId, session.id)
    log.withFields({ extensionId, sessionId: session.id }).log('extension loaded')
  }

  const stopLoadedExtensionById = async (extensionId: string) => {
    const sessionId = loadedSessionIds.get(extensionId)
    if (!sessionId) {
      loaded.delete(extensionId)
      return
    }

    await host.stop(sessionId)
    loadedSessionIds.delete(extensionId)
    loaded.delete(extensionId)

    clearModuleAssetSessionCacheByOwnerSessionId(sessionId)
    await extensionAssetService.revokeByOwnerSessionId(sessionId)

    log.withFields({ extensionId, sessionId }).log('extension unloaded')
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
  const autoReloadFeature = createExtensionAutoReloadFeature({
    getConfig,
    isLoaded: extensionId => loaded.has(extensionId),
    listEntries: () => extensionRegistry.listEntries(),
    log,
    reload: async (extensionId) => {
      await stopLoadedExtensionById(extensionId)
      await refreshManifests()
      await loadExtensionById(extensionId, { cacheBustKey: `auto-reload-${Date.now()}` })
    },
    resolveWatchPaths: resolveAutoReloadWatchPaths,
  })

  const unloadExtensionById = async (extensionId: string) => {
    autoReloadFeature.clearExtension(extensionId)
    await stopLoadedExtensionById(extensionId)
  }

  const loadEnabledExtensions = async () => {
    const config = getConfig()
    for (const entry of extensionRegistry.listEntries()) {
      const extensionId = manifestIdOf(entry.manifest)
      if (!config.enabled.includes(extensionId)) {
        continue
      }
      if (loaded.has(extensionId)) {
        continue
      }

      try {
        await loadExtensionById(extensionId)
      }
      catch (error) {
        log.withError(error).withFields({ extensionId }).error('extension failed to start')
      }
    }

    autoReloadFeature.sync()
  }

  await refreshManifests()
  await loadEnabledExtensions()
  autoReloadFeature.sync()

  return {
    async dispose() {
      autoReloadFeature.dispose()
      builtInKitRuntime.dispose()

      moduleAssetSessionCache.clear()
      await extensionAssetService.revokeAll()
      await extensionAssetService.stop()
    },
    getAssetBaseUrl() {
      return extensionAssetService.getBaseUrl() ?? ''
    },
    host,
    async inspect() {
      await refreshManifests()
      autoReloadFeature.sync()
      return await inspectSnapshot()
    },
    async list() {
      await refreshManifests()
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async load(extensionId) {
      await refreshManifests()
      await loadExtensionById(extensionId)
      autoReloadFeature.sync()
      return listSnapshot()
    },
    async loadEnabled() {
      await refreshManifests()
      await loadEnabledExtensions()
      autoReloadFeature.sync()
      return listSnapshot()
    },
    manifests: extensionRegistry.listManifests(),
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
    async setEnabled(payload) {
      await refreshManifests()

      const config = getConfig()
      const enabled = new Set(config.enabled)
      if (payload.enabled) {
        enabled.add(payload.extensionId)
      }
      else {
        enabled.delete(payload.extensionId)
        clearModuleAssetSessionCacheByExtensionId(payload.extensionId)
        await extensionAssetService.revokeByExtensionId(payload.extensionId)
      }

      const entry = extensionRegistry.findManifestEntry(payload.extensionId)
      const manifestPath = entry?.path ?? payload.path ?? ''
      extensionConfig.update({
        autoReload: config.autoReload,
        enabled: [...enabled],
        known: {
          ...config.known,
          [payload.extensionId]: { path: manifestPath },
        },
      })

      autoReloadFeature.sync()
      return listSnapshot()
    },
    // REVIEW: Tool registry ownership is currently hidden inside the built-in kit runtime even though
    // the host service also exposes it for IPC listing/invocation. Consider moving registry ownership
    // to this host service and passing it into kit registration as a dependency.
    tools: builtInKitRuntime.tools,
    async unload(extensionId) {
      await unloadExtensionById(extensionId)
      autoReloadFeature.sync()
      return listSnapshot()
    },
  }
}

function createElectronExtensionAssetCookieAdapter() {
  return {
    async removeCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.remove(cookie.url, cookie.name)
    },
    async setCookie(cookie: ExtensionAssetCookie) {
      await electronSession.defaultSession.cookies.set({
        expirationDate: Math.floor(cookie.expiresAt / 1000),
        httpOnly: true,
        name: cookie.name,
        path: cookie.path,
        sameSite: 'no_restriction',
        secure: true,
        url: cookie.url,
        value: cookie.value,
      })
    },
  }
}
