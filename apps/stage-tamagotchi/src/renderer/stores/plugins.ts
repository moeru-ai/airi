import type { PluginManifestSummary, PluginRegistrySnapshot } from '../../shared/eventa/plugin/host'

import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import {
  electronPluginList,
  electronPluginLoad,
  electronPluginOpenFolder,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../../shared/eventa/plugin/host'

/**
 * User-facing plugin management for the drop-in plugin directory.
 *
 * Ownership:
 * - The Electron main process owns plugin discovery, persisted enablement, and
 *   plugin sessions. This store only mirrors registry snapshots and issues
 *   commands over the plugin-host IPC contracts.
 * - Enable/disable is a two-step main-process protocol: `set-enabled` persists
 *   the choice, `load`/`unload` starts or stops the runtime session. Both steps
 *   run through this store so the UI never observes a persisted-but-untouched
 *   enablement state after a click. Disable unloads before it persists, so a
 *   disabled plugin never keeps running.
 */
export const usePluginsStore = defineStore('plugins', () => {
  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const openPluginFolder = useElectronEventaInvoke(electronPluginOpenFolder)

  const plugins = ref<PluginManifestSummary[]>([])
  const root = ref('')
  const loading = ref(false)
  /** Extension id of the row that issued the in-flight command, if any. */
  const pendingExtensionId = ref<string>()

  const sortedPlugins = computed(() => {
    return [...plugins.value].sort((left, right) => left.extensionId.localeCompare(right.extensionId))
  })

  function assignSnapshot(snapshot: PluginRegistrySnapshot) {
    plugins.value = snapshot.plugins
    root.value = snapshot.root
  }

  async function refresh() {
    loading.value = true
    try {
      assignSnapshot(await listPlugins())
    }
    finally {
      loading.value = false
    }
  }

  async function runCommand(extensionId: string, command: () => Promise<void>) {
    loading.value = true
    pendingExtensionId.value = extensionId
    try {
      await command()
    }
    finally {
      pendingExtensionId.value = undefined
      loading.value = false
    }
  }

  async function enableAndLoad(extensionId: string, path?: string) {
    await runCommand(extensionId, async () => {
      assignSnapshot(await setPluginEnabled({ extensionId, enabled: true, path }))
      assignSnapshot(await loadPlugin({ extensionId }))
    })
  }

  async function disableAndUnload(extensionId: string, path?: string) {
    await runCommand(extensionId, async () => {
      // Stop the session before the store persists the disabled state. If
      // unload fails, the plugin stays enabled and loaded instead of disabled
      // and loaded.
      assignSnapshot(await unloadPlugin({ extensionId }))
      assignSnapshot(await setPluginEnabled({ extensionId, enabled: false, path }))
    })
  }

  async function reload(extensionId: string) {
    const plugin = plugins.value.find(plugin => plugin.extensionId === extensionId)

    // Reload restarts only an enabled plugin. The main process loads a disabled
    // plugin on request. Refuse the command, because a disabled plugin must not run.
    if (plugin && !plugin.enabled) {
      throw new Error(`Cannot reload disabled plugin: ${extensionId}`)
    }

    // Main-process unload treats unknown sessions as already stopped, so reload
    // also works for plugins that are enabled but not currently loaded.
    await runCommand(extensionId, async () => {
      await unloadPlugin({ extensionId })
      assignSnapshot(await loadPlugin({ extensionId }))
    })
  }

  async function openFolder() {
    await openPluginFolder()
  }

  return {
    plugins,
    root,
    loading,
    pendingExtensionId,
    sortedPlugins,

    refresh,
    enableAndLoad,
    disableAndUnload,
    reload,
    openFolder,
  }
})
