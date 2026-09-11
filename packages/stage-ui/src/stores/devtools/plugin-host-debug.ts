import type {
  ExtensionDirectoryImportPrepareResult,
  PluginCapabilityState,
  PluginHostDebugSnapshot,
  PluginHostKitSummary,
  PluginHostSessionSummary,
  PluginRegistrySnapshot,
} from '@proj-airi/stage-shared/plugin-host'

import { errorMessageFrom } from '@moeru/std'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

interface PluginHostDebugBridge {
  prepareDirectoryImport: () => Promise<ExtensionDirectoryImportPrepareResult>
  commitDirectoryImport: (payload: { planId: string }) => Promise<PluginRegistrySnapshot>
  cancelDirectoryImport: (payload: { planId: string }) => Promise<void>
  list: () => Promise<PluginRegistrySnapshot>
  setEnabled: (payload: { extensionId: string, enabled: boolean, path?: string }) => Promise<PluginRegistrySnapshot>
  setAutoReload: (payload: { extensionId: string, enabled: boolean }) => Promise<PluginRegistrySnapshot>
  loadEnabled: () => Promise<PluginRegistrySnapshot>
  load: (payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>
  unload: (payload: { extensionId: string }) => Promise<PluginRegistrySnapshot>
  inspect: () => Promise<PluginHostDebugSnapshot>
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

  async function prepareDirectoryImport() {
    return await withBridge(activeBridge => activeBridge.prepareDirectoryImport())
  }

  async function commitDirectoryImport(payload: { planId: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.commitDirectoryImport(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function cancelDirectoryImport(payload: { planId: string }) {
    await withBridge(activeBridge => activeBridge.cancelDirectoryImport(payload))
  }

  async function refreshInspection() {
    const snapshot = await withBridge(activeBridge => activeBridge.inspect())
    assignInspection(snapshot)
    return snapshot
  }

  async function refreshAll() {
    return refreshInspection()
  }

  async function setEnabled(payload: { extensionId: string, enabled: boolean, path?: string }) {
    const nextRegistry = await withBridge(activeBridge => activeBridge.setEnabled(payload))
    assignRegistry(nextRegistry)
    await refreshInspection()
    return nextRegistry
  }

  async function setAutoReload(payload: { extensionId: string, enabled: boolean }) {
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

  /** Keeps enablement visible if loading fails, so the user can retry loading. */
  async function enableAndLoad(payload: { extensionId: string, path?: string }) {
    return withBridge(async (activeBridge) => {
      assignRegistry(await activeBridge.setEnabled({ ...payload, enabled: true }))
      const nextRegistry = await activeBridge.load({ extensionId: payload.extensionId })
      assignRegistry(nextRegistry)
      assignInspection(await activeBridge.inspect())
      return nextRegistry
    })
  }

  /** Keeps the plugin disabled for future startup even if stopping its current session fails. */
  async function disableAndUnload(payload: { extensionId: string, path?: string }) {
    return withBridge(async (activeBridge) => {
      assignRegistry(await activeBridge.setEnabled({ ...payload, enabled: false }))
      const nextRegistry = await activeBridge.unload({ extensionId: payload.extensionId })
      assignRegistry(nextRegistry)
      assignInspection(await activeBridge.inspect())
      return nextRegistry
    })
  }

  return {
    registry,
    sessions,
    kits,
    capabilities,
    refreshedAt,
    loading,
    error,
    discoveredPlugins,
    enabledPlugins,
    loadedPlugins,
    isAvailable,

    setBridge,
    clearError,
    prepareDirectoryImport,
    commitDirectoryImport,
    cancelDirectoryImport,
    refreshRegistry,
    refreshInspection,
    refreshAll,
    setEnabled,
    setAutoReload,
    loadEnabled,
    load,
    unload,
    enableAndLoad,
    disableAndUnload,
  }
})
