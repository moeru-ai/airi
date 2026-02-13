import type { ManifestV1 } from '@proj-airi/plugin-sdk/plugin-host'

import type { PluginManifestSummary, PluginRegistrySnapshot } from '../../../../shared/eventa'

import { mkdir, readdir, readFile } from 'node:fs/promises'
import { dirname, extname, join } from 'node:path'

import { useLogg } from '@guiiai/logg'
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { createContext } from '@moeru/eventa/adapters/electron/main'
import { manifestV1Schema, PluginHost } from '@proj-airi/plugin-sdk/plugin-host'
import { app, ipcMain } from 'electron'
import { array, object, record, safeParse, string } from 'valibot'

import {
  electronPluginList,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
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
    state: 'announced' | 'ready'
    metadata?: Record<string, unknown>
    updatedAt: number
  }
  markCapabilityReady: (key: string, metadata?: Record<string, unknown>) => {
    key: string
    state: 'announced' | 'ready'
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

  for (const entry of entries) {
    if (!entry.isFile())
      continue

    if (extname(entry.name) !== '.json')
      continue

    const path = join(dir, entry.name)
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

  const loadEnabled = async () => {
    const config = getConfig()
    for (const entry of entries) {
      const name = entry.manifest.name
      if (!config.enabled.includes(name))
        continue
      if (loaded.has(name))
        continue

      try {
        await host.start(entry.manifest, { cwd: dirname(entry.path) })
        loaded.add(name)
        log.log('plugin loaded', { plugin: name })
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
