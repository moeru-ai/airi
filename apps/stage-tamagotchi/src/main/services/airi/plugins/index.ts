import type { ManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import type {
  PluginHostDebugSnapshot,
  PluginManifestSummary,
  PluginRegistrySnapshot,
} from '../../../../shared/eventa'

import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { manifestV1Schema, PluginHost } from '@proj-airi/plugin-sdk/plugin-host'
import { app, ipcMain } from 'electron'
import { array, object, record, safeParse, string } from 'valibot'

import {
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../../../../shared/eventa'
import { onAppReady } from '../../../libs/bootkit/lifecycle'
import { createConfig } from '../../../libs/electron/persistence'

interface PluginHostService {
  host: PluginHost
  manifests: ManifestV1[]
}

interface CapabilityAwarePluginHost extends PluginHost {
  setProvidersListResolver: (resolver: () => Promise<Array<{ name: string }>> | Array<{ name: string }>) => void
  announceCapability: (key: string, metadata?: Record<string, unknown>) => {
    key: string
    state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
    metadata?: Record<string, unknown>
    updatedAt: number
  }
  markCapabilityReady: (key: string, metadata?: Record<string, unknown>) => {
    key: string
    state: 'announced' | 'ready' | 'degraded' | 'withdrawn'
    metadata?: Record<string, unknown>
    updatedAt: number
  }
}

interface PluginConfig {
  enabled: string[]
  known: Record<string, { path: string }>
}

interface ManifestEntry {
  manifest: ManifestV1
  path: string
}

const pluginConfigSchema = object({
  enabled: array(string()),
  known: record(string(), object({
    path: string(),
  })),
})

function isManifestV1(value: unknown): value is ManifestV1 {
  return safeParse(manifestV1Schema, value).success
}

async function loadManifestsFrom(dir: string, log: ReturnType<typeof useLogg>): Promise<ManifestEntry[]> {
  await mkdir(dir, { recursive: true })
  const entries = await readdir(dir, { withFileTypes: true })
  const manifests: ManifestEntry[] = []
  const manifestPaths: string[] = []

  for (const entry of entries) {
    if (!entry.isDirectory())
      continue

    const pluginDir = join(dir, entry.name)
    const pluginEntries = await readdir(pluginDir, { withFileTypes: true })
    for (const pluginEntry of pluginEntries) {
      if (!pluginEntry.isFile())
        continue
      if (extname(pluginEntry.name) !== '.json')
        continue

      manifestPaths.push(join(pluginDir, pluginEntry.name))
    }
  }

  for (const path of manifestPaths) {
    try {
      const raw = await readFile(path, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!isManifestV1(parsed)) {
        log.warn('invalid plugin manifest schema', { path })
        continue
      }

      manifests.push({ manifest: parsed, path })
    }
    catch (error) {
      log.withError(error).withFields({ path }).error('failed to read plugin manifest')
    }
  }

  return manifests
}

function createPluginSummary(entry: ManifestEntry, config: PluginConfig, loaded: Set<string>): PluginManifestSummary {
  const name = entry.manifest.name
  return {
    name,
    entrypoints: entry.manifest.entrypoints,
    path: entry.path,
    enabled: config.enabled.includes(name),
    loaded: loaded.has(name),
    isNew: !config.known[name],
  }
}

/**
 * Initializes the Electron plugin host and wires IPC handlers.
 * Call once during app startup; it loads manifests, returns the host instance,
 * and registers Eventa handlers for listing, enabling, and loading plugins.
 *
 * Loads plugin manifests from the app config directory under `plugins/v1`.
 *
 * - Windows: %APPDATA%\${appId}\plugins\v1
 * - Linux: $XDG_CONFIG_HOME/${appId}/plugins/v1 or ~/.config/${appId}/plugins/v1
 * - macOS: ~/Library/Application Support/${appId}/plugins/v1
 *
 * Persists enablement/known state to `plugins-v1.json` alongside config data.
 *
 * - Windows: %APPDATA%\${appId}\plugins-v1.json
 * - Linux: $XDG_CONFIG_HOME/${appId}/plugins-v1.json or ~/.config/${appId}/plugins-v1.json
 * - macOS: ~/Library/Application Support/${appId}/plugins-v1.json
 */
export async function setupPluginHost(): Promise<PluginHostService> {
  const log = useLogg('main/plugin-host').useGlobalConfig()
  const pluginsRoot = join(app.getPath('userData'), 'plugins', 'v1')

  const pluginConfig = createConfig('plugins', 'v1.json', pluginConfigSchema, {
    default: {
      enabled: [],
      known: {},
    },
    autoHeal: true,
  })

  pluginConfig.setup()

  const host = new PluginHost({ runtime: 'electron' })
  // NOTICE: stage-tamagotchi currently typechecks against package exports while plugin-sdk changes
  // are source-local in this workspace. Cast keeps the bridge typed until package dist is regenerated.
  const capabilityHost = host as CapabilityAwarePluginHost
  let entries = await loadManifestsFrom(pluginsRoot, log)
  let manifests = entries.map(entry => entry.manifest)
  const loaded = new Set<string>()
  const loadedSessionIds = new Map<string, string>()

  const refreshManifests = async () => {
    entries = await loadManifestsFrom(pluginsRoot, log)
    manifests = entries.map(entry => entry.manifest)
  }

  const getConfig = (): PluginConfig => {
    return pluginConfig.get() ?? { enabled: [], known: {} }
  }

  const toSnapshot = (): PluginRegistrySnapshot => {
    const config = getConfig()
    return {
      root: pluginsRoot,
      plugins: entries.map(entry => createPluginSummary(entry, config, loaded)),
    }
  }

  const toDebugSnapshot = (): PluginHostDebugSnapshot => {
    return {
      registry: toSnapshot(),
      sessions: host.listSessions().map(session => ({
        id: session.id,
        manifestName: session.manifest.name,
        phase: session.phase,
        runtime: session.runtime,
        moduleId: session.identity.id,
      })),
      capabilities: capabilityHost.listCapabilities(),
      refreshedAt: Date.now(),
    }
  }

  const findManifestEntry = (name: string) => {
    return entries.find(entry => entry.manifest.name === name)
  }

  const loadPluginByName = async (name: string) => {
    if (loaded.has(name))
      return

    const entry = findManifestEntry(name)
    if (!entry) {
      throw new Error(`Plugin manifest not found: ${name}`)
    }

    const session = await host.start(entry.manifest, { cwd: dirname(entry.path) })
    loaded.add(name)
    loadedSessionIds.set(name, session.id)
    log.log('plugin loaded', { plugin: name, sessionId: session.id })
  }

  const unloadPluginByName = (name: string) => {
    const sessionId = loadedSessionIds.get(name)
    if (!sessionId) {
      loaded.delete(name)
      return
    }

    host.stop(sessionId)
    loadedSessionIds.delete(name)
    loaded.delete(name)
    log.log('plugin unloaded', { plugin: name, sessionId })
  }

  const loadEnabled = async () => {
    const config = getConfig()
    for (const entry of entries) {
      const name = entry.manifest.name
      if (!config.enabled.includes(name))
        continue
      if (loaded.has(name))
        continue

      try {
        await loadPluginByName(name)
      }
      catch (error) {
        log.withError(error).withFields({ plugin: name }).error('plugin failed to start')
      }
    }
  }

  const { context } = createContext(ipcMain)
  const invokePluginProtocolListProviders = defineInvoke(context, pluginProtocolListProviders)

  defineInvokeHandler(context, electronPluginList, async () => {
    // IPC: fetch current plugin list by refreshing manifests and returning a snapshot.
    await refreshManifests()
    return toSnapshot()
  })

  defineInvokeHandler(context, electronPluginSetEnabled, async (payload) => {
    // IPC: toggle a plugin's enabled state, persist config, and return updated snapshot.
    await refreshManifests()
    const config = getConfig()
    const enabled = new Set(config.enabled)
    if (payload?.enabled)
      enabled.add(payload.name)
    else
      enabled.delete(payload.name)

    const entry = entries.find(candidate => candidate.manifest.name === payload.name)
    const manifestPath = entry?.path ?? payload.path ?? ''
    const nextConfig: PluginConfig = {
      enabled: [...enabled],
      known: {
        ...config.known,
        [payload.name]: { path: manifestPath },
      },
    }

    pluginConfig.update(nextConfig)

    return toSnapshot()
  })

  defineInvokeHandler(context, electronPluginLoadEnabled, async () => {
    // IPC: load all enabled plugins and return the latest snapshot.
    await refreshManifests()
    await loadEnabled()
    return toSnapshot()
  })

  defineInvokeHandler(context, electronPluginLoad, async (payload) => {
    await refreshManifests()
    await loadPluginByName(payload.name)
    return toSnapshot()
  })

  defineInvokeHandler(context, electronPluginUnload, async (payload) => {
    unloadPluginByName(payload.name)
    return toSnapshot()
  })

  defineInvokeHandler(context, electronPluginInspect, async () => {
    await refreshManifests()
    return toDebugSnapshot()
  })

  defineInvokeHandler(context, electronPluginUpdateCapability, async (payload) => {
    if (payload.key === pluginProtocolListProvidersEventName && payload.state === 'ready') {
      capabilityHost.setProvidersListResolver(async () => await invokePluginProtocolListProviders())
    }

    if (payload.state === 'announced') {
      return capabilityHost.announceCapability(payload.key, payload.metadata)
    }

    return capabilityHost.markCapabilityReady(payload.key, payload.metadata)
  })

  onAppReady(async () => {
    await refreshManifests()
    await loadEnabled()
  })

  return { host, manifests }
}
