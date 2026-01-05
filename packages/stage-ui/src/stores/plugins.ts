import { defineStore } from 'pinia'
import { computed, ref } from 'vue'

import { createResettableLocalStorage } from '../utils/resettable'
import { useConfiguratorByModsChannelServer } from './configurator'

export interface PluginPeer {
  index: number | undefined
  peerId: string
}

export interface ConnectedPlugin {
  name: string
  connectedCount: number
  peers: PluginPeer[]
}

export interface PluginMetadata {
  id: string
  name: string
  description: string
  icon?: string
  iconColor?: string
}

// Known plugins metadata registry
const KNOWN_PLUGINS: Record<string, PluginMetadata> = {
  'youtube-livechat': {
    id: 'youtube-livechat',
    name: 'settings.pages.plugins.known.youtube-livechat.title',
    description: 'settings.pages.plugins.known.youtube-livechat.description',
    icon: 'i-simple-icons:youtube',
    iconColor: 'text-red-500',
  },
  'discord': {
    id: 'discord',
    name: 'settings.pages.plugins.known.discord.title',
    description: 'settings.pages.plugins.known.discord.description',
    icon: 'i-simple-icons:discord',
    iconColor: 'text-indigo-500',
  },
  'homeassistant': {
    id: 'homeassistant',
    name: 'settings.pages.plugins.known.homeassistant.title',
    description: 'settings.pages.plugins.known.homeassistant.description',
    icon: 'i-simple-icons:homeassistant',
    iconColor: 'text-cyan-500',
  },
  'bilibili-laplace': {
    id: 'bilibili-laplace',
    name: 'settings.pages.plugins.known.bilibili-laplace.title',
    description: 'settings.pages.plugins.known.bilibili-laplace.description',
    icon: 'i-simple-icons:bilibili',
    iconColor: 'text-pink-500',
  },
}

export const usePluginsStore = defineStore('plugins', () => {
  const configurator = useConfiguratorByModsChannelServer()

  // Connected plugins from server
  const connectedPlugins = ref<ConnectedPlugin[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Local plugin settings (enabled/disabled states)
  const [pluginSettings, resetPluginSettings] = createResettableLocalStorage<Record<string, { enabled: boolean }>>(
    'settings/plugins/settings',
    {},
  )

  // API base URL
  const apiBaseUrl = computed(() => {
    const wsUrl = import.meta.env.VITE_AIRI_WS_URL || 'ws://localhost:6121/ws'
    // Convert ws:// to http:// and remove /ws path
    return wsUrl.replace(/^ws/, 'http').replace(/\/ws$/, '')
  })

  // Fetch connected plugins from server
  async function fetchConnectedPlugins() {
    loading.value = true
    error.value = null

    try {
      const response = await fetch(`${apiBaseUrl.value}/api/plugins`)
      if (!response.ok) {
        throw new Error(`Failed to fetch plugins: ${response.statusText}`)
      }

      const data = await response.json()
      connectedPlugins.value = data.plugins || []
    }
    catch (err) {
      error.value = err instanceof Error ? err.message : 'Failed to fetch plugins'
      console.error('Failed to fetch connected plugins:', err)
    }
    finally {
      loading.value = false
    }
  }

  // Get plugin metadata (known or generic)
  function getPluginMetadata(pluginName: string): PluginMetadata {
    if (KNOWN_PLUGINS[pluginName]) {
      return KNOWN_PLUGINS[pluginName]
    }

    // Return generic metadata for unknown plugins
    return {
      id: pluginName,
      name: pluginName,
      description: 'settings.pages.plugins.unknown-plugin-description',
      icon: 'i-solar:plug-circle-bold-duotone',
    }
  }

  // Check if a plugin is connected
  function isPluginConnected(pluginName: string): boolean {
    return connectedPlugins.value.some(p => p.name === pluginName)
  }

  // Check if a plugin is enabled (local setting)
  function isPluginEnabled(pluginName: string): boolean {
    return pluginSettings.value[pluginName]?.enabled ?? true
  }

  // Enable or disable a plugin
  function setPluginEnabled(pluginName: string, enabled: boolean) {
    pluginSettings.value = {
      ...pluginSettings.value,
      [pluginName]: { enabled },
    }

    // Send configuration to the plugin
    configurator.updateFor(pluginName, { enabled })
  }

  // Send configuration to a specific plugin
  function configurePlugin(pluginName: string, config: Record<string, unknown>) {
    configurator.updateFor(pluginName, config)
  }

  // Get list of all plugins (connected + known)
  const allPlugins = computed(() => {
    const plugins = new Map<string, { metadata: PluginMetadata, connected: boolean, connectedCount: number }>()

    // Add connected plugins
    for (const plugin of connectedPlugins.value) {
      plugins.set(plugin.name, {
        metadata: getPluginMetadata(plugin.name),
        connected: true,
        connectedCount: plugin.connectedCount,
      })
    }

    // Add known plugins that are not connected
    for (const [name, metadata] of Object.entries(KNOWN_PLUGINS)) {
      if (!plugins.has(name)) {
        plugins.set(name, {
          metadata,
          connected: false,
          connectedCount: 0,
        })
      }
    }

    return Array.from(plugins.values())
  })

  // Reset all plugin settings
  function resetState() {
    resetPluginSettings()
    connectedPlugins.value = []
    error.value = null
  }

  return {
    // State
    connectedPlugins,
    loading,
    error,
    pluginSettings,
    allPlugins,

    // Actions
    fetchConnectedPlugins,
    getPluginMetadata,
    isPluginConnected,
    isPluginEnabled,
    setPluginEnabled,
    configurePlugin,
    resetState,
  }
})
