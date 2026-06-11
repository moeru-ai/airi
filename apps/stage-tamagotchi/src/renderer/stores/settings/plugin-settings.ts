import type { PluginConfigSnapshot } from '../../../shared/eventa/plugin/config'
import type { PluginManifestSummary, PluginRegistrySnapshot } from '../../../shared/eventa/plugin/host'

import { errorMessageFrom } from '@moeru/std'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { acceptHMRUpdate, defineStore } from 'pinia'
import { ref } from 'vue'

import {
  electronPluginGetConfig,
  electronPluginSetConfig,
} from '../../../shared/eventa/plugin/config'
import {
  electronPluginList,
  electronPluginLoad,
  electronPluginSetEnabled,
  electronPluginUnload,
} from '../../../shared/eventa/plugin/host'
import { useTamagotchiPluginToolsStore } from '../plugin-tools'

// REVIEW: PluginSettingsEntry no longer overrides displayName/description/version;
// these are now passed through from the main process via PluginManifestSummary.
export type PluginSettingsEntry = PluginManifestSummary

export const usePluginSettingsStore = defineStore('tamagotchi-plugin-settings', () => {
  const plugins = ref<PluginSettingsEntry[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  const listPlugins = useElectronEventaInvoke(electronPluginList)
  const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
  const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
  const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
  const getConfig = useElectronEventaInvoke(electronPluginGetConfig)
  const setConfig = useElectronEventaInvoke(electronPluginSetConfig)

  async function refresh() {
    loading.value = true
    error.value = null
    try {
      const snapshot: PluginRegistrySnapshot = await listPlugins()
      plugins.value = snapshot.plugins.map(p => ({
        ...p,
      }))
    }
    catch (err) {
      const message = errorMessageFrom(err) ?? 'Failed to load plugins'
      error.value = message
      console.warn('[plugin-settings] failed to refresh:', message)
    }
    finally {
      loading.value = false
    }
  }

  async function setEnabled(name: string, enabled: boolean) {
    try {
      await setPluginEnabled({ name, enabled })
      await refresh()
      const toolsStore = useTamagotchiPluginToolsStore()
      toolsStore.refresh().catch(() => {})
    }
    catch (err) {
      const message = errorMessageFrom(err) ?? `Failed to ${enabled ? 'enable' : 'disable'} plugin`
      console.warn('[plugin-settings] setEnabled failed:', message)
    }
  }

  async function load(name: string) {
    try {
      await loadPlugin({ name })
      await refresh()
    }
    catch (err) {
      const message = errorMessageFrom(err) ?? 'Failed to load plugin'
      console.warn('[plugin-settings] load failed:', message)
    }
  }

  async function unload(name: string) {
    try {
      await unloadPlugin({ name })
      await refresh()
    }
    catch (err) {
      const message = errorMessageFrom(err) ?? 'Failed to unload plugin'
      console.warn('[plugin-settings] unload failed:', message)
    }
  }

  async function getPluginConfig(pluginName: string): Promise<PluginConfigSnapshot> {
    return await getConfig({ pluginName })
  }

  async function savePluginConfig(pluginName: string, config: Record<string, unknown>) {
    try {
      await setConfig({ pluginName, config })
      await refresh()
    }
    catch (err) {
      const message = errorMessageFrom(err) ?? 'Failed to save plugin config'
      console.warn('[plugin-settings] savePluginConfig failed:', message)
      throw err
    }
  }

  return {
    plugins,
    loading,
    error,
    refresh,
    setEnabled,
    load,
    unload,
    getPluginConfig,
    savePluginConfig,
  }
})

if (import.meta.hot) {
  import.meta.hot.accept(acceptHMRUpdate(usePluginSettingsStore, import.meta.hot))
}
