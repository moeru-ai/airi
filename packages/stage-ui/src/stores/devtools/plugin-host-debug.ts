import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

// TODO: Replace with re-export of CapabilityDescriptor from
// @proj-airi/plugin-sdk once stage-ui can depend on the SDK.
export interface PluginCapabilityState {
  key: string
  metadata?: Record<string, unknown>
  state: 'announced' | 'degraded' | 'ready' | 'withdrawn'
  updatedAt: number
}

export interface PluginHostDebugSnapshot {
  capabilities: PluginCapabilityState[]
  kits: PluginHostKitSummary[]
  modules: PluginHostModuleSummary[]
  refreshedAt: number
  registry: PluginRegistrySnapshot
  sessions: PluginHostSessionSummary[]
}

export interface PluginHostKitCapabilitySummary {
  actions: string[]
  key: string
}

export interface PluginHostKitSummary {
  capabilities: PluginHostKitCapabilitySummary[]
  kitId: string
  runtimes: Array<'electron' | 'node' | 'web'>
  version: string
}

export interface PluginHostModuleSummary {
  config: Record<string, unknown>
  kitId: string
  kitModuleType: string
  moduleId: string
  ownerExtensionId: string
  ownerSessionId: string
  revision: number
  runtime: 'electron' | 'node' | 'web'
  state: 'active' | 'announced' | 'degraded' | 'withdrawn'
  updatedAt: number
}

export interface PluginHostSessionSummary {
  extensionId: string
  id: string
  moduleId: string
  phase: string
  runtime: 'electron' | 'node' | 'web'
}

export interface PluginManifestSummary {
  autoReload: boolean
  enabled: boolean
  entrypoints: Record<string, string | undefined>
  extensionId: string
  isNew: boolean
  loaded: boolean
  path: string
}

export interface PluginRegistrySnapshot {
  plugins: PluginManifestSummary[]
  root: string
}

interface PluginHostDebugBridge {
  inspect: () => Promise<PluginHostDebugSnapshot>
  list: () => Promise<PluginRegistrySnapshot>
  load: (payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>
  loadEnabled: () => Promise<PluginRegistrySnapshot>
  setAutoReload: (payload: { enabled: boolean, extensionId: string }) => Promise<PluginRegistrySnapshot>
  setEnabled: (payload: { enabled: boolean, extensionId: string, path?: string }) => Promise<PluginRegistrySnapshot>
  unload: (payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>
}

export const usePluginHostInspectorStore = defineStore('devtools:plugin-host-debug', () => {
  // Runtime bridge injected by the renderer host (Electron).
  //
  // Why this exists:
  // - `stage-pages` is shared by web + desktop.
  // - Plugin-host IPC only exists in desktop (stage-tamagotchi main process).
  // - This store keeps UI code shared, and receives runtime-specific operations via `setBridge(...)`.
  //
  // In web/non-electron runtimes, bridge stays undefined and debug actions fail with a clear message.
  const bridge = ref<PluginHostDebugBridge>()
  const registry = ref<PluginRegistrySnapshot>()
  const sessions = ref<PluginHostSessionSummary[]>([])
  const kits = ref<PluginHostKitSummary[]>([])
  const capabilities = ref<PluginCapabilityState[]>([])
  const refreshedAt = ref<number>()
  const error = ref<string>()
  const loading = ref(false)

  const discoveredPlugins = computed(() => registry.value?.plugins ?? [])
  const enabledPlugins = computed(() => discoveredPlugins.value.filter(plugin => plugin.enabled))
  const loadedPlugins = computed(() => discoveredPlugins.value.filter(plugin => plugin.loaded))
  const isAvailable = computed(() => Boolean(bridge.value))

  function setBridge(nextBridge: PluginHostDebugBridge) {
    // Called by renderer bootstrap once Eventa invoke functions are available.
    // This turns the shared debug page "online" without coupling it to electron-only imports.
    bridge.value = nextBridge
  }

  function clearError() {
    error.value = undefined
  }

  function assignRegistry(nextRegistry: PluginRegistrySnapshot) {
    registry.value = nextRegistry
  }

  function assignInspection(snapshot: PluginHostDebugSnapshot) {
    assignRegistry(snapshot.registry)
    sessions.value = snapshot.sessions
    kits.value = snapshot.kits
    capabilities.value = snapshot.capabilities
    refreshedAt.value = snapshot.refreshedAt
  }

  async function withBridge<T>(run: (activeBridge: PluginHostDebugBridge) => Promise<T>) {
    // Single guard/flow wrapper for every debug action.
    //
    // What it does:
    // 1) Runtime gate: blocks actions until bridge is registered.
    // 2) Loading lifecycle: toggles `loading` in a centralized place.
    // 3) Error normalization: stores user-facing error text for the debug page.
    //
    // Why debug store needs this:
    // - Debug actions are async IPC calls and may fail for runtime/setup reasons.
    // - A shared wrapper avoids duplicated try/catch/loading logic across each action.
    // - It gives deterministic UI behavior (same errors/spinner semantics for all commands).
    if (!bridge.value) {
      const message = 'Plugin host debug bridge is not available in this runtime.'
      error.value = message
      throw new Error(message)
    }

    loading.value = true
    clearError()
    try {
      return await run(bridge.value)
    }
    catch (cause) {
      error.value = errorMessageFrom(cause) ?? 'Plugin host debug request failed.'
      throw cause
    }
    finally {
      loading.value = false
    }
  }

  async function refreshRegistry() {
    const nextRegistry = await withBridge(activeBridge => activeBridge.list())
    assignRegistry(nextRegistry)
    return nextRegistry
  }

  async function refreshInspection() {
    const snapshot = await withBridge(activeBridge => activeBridge.inspect())
    assignInspection(snapshot)
    return snapshot
  }

  async function refreshAll() {
    return refreshInspection()
  }

  async function setEnabled(payload: { enabled: boolean, extensionId: string, path?: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.setEnabled(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function setAutoReload(payload: { enabled: boolean, extensionId: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.setAutoReload(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function loadEnabled() {
    const nextRegistry = await withBridge(activeBridge => activeBridge.loadEnabled())
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function load(payload: { extensionId: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.load(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function unload(payload: { extensionId: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.unload(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  return {
    capabilities,
    clearError,
    discoveredPlugins,
    enabledPlugins,
    error,
    isAvailable,
    kits,
    load,
    loadedPlugins,
    loadEnabled,
    loading,

    refreshAll,
    refreshedAt,
    refreshInspection,
    refreshRegistry,
    registry,
    sessions,
    setAutoReload,
    setBridge,
    setEnabled,
    unload,
  }
})
