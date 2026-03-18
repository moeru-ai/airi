<script setup lang="ts">
import { defineInvokeHandler } from '@moeru/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { usePluginHostInspectorStore } from '@proj-airi/stage-ui/stores/devtools/plugin-host-debug'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { clearMcpToolBridge, setMcpToolBridge } from '@proj-airi/stage-ui/stores/mcp-tool-bridge'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useDiscordStore } from '@proj-airi/stage-ui/stores/modules/discord'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-airi/stage-ui/stores/plugin-host-capabilities'
import { useProactivityStore } from '@proj-airi/stage-ui/stores/proactivity'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronGetServerChannelConfig,
  electronMcpCallTool,
  electronMcpListTools,
  electronOpenOnboarding,
  electronOpenSettings,
  electronPluginInspect,
  electronPluginList,
  electronPluginLoad,
  electronPluginLoadEnabled,
  electronPluginSetEnabled,
  electronPluginUnload,
  electronPluginUpdateCapability,
  electronStartTrackMousePosition,
  i18nSetLocale,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa'
import { useServerChannelSettingsStore } from './stores/settings/server-channel'
import { widgetsTools } from './stores/tools/builtin/widgets'

const { isDark: dark } = useTheme()
const i18n = useI18n()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const serverChannelSettingsStore = useServerChannelSettingsStore()
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()
const cardStore = useAiriCardStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const analyticsStore = useSharedAnalyticsStore()
const pluginHostInspectorStore = usePluginHostInspectorStore()
const discordStore = useDiscordStore()
usePerfTracerBridgeStore()

const proactivityStore = useProactivityStore()

const context = useElectronEventaContext()
const getServerChannelConfig = useElectronEventaInvoke(electronGetServerChannelConfig)
const listPlugins = useElectronEventaInvoke(electronPluginList)
const setPluginEnabled = useElectronEventaInvoke(electronPluginSetEnabled)
const loadEnabledPlugins = useElectronEventaInvoke(electronPluginLoadEnabled)
const loadPlugin = useElectronEventaInvoke(electronPluginLoad)
const unloadPlugin = useElectronEventaInvoke(electronPluginUnload)
const inspectPluginHost = useElectronEventaInvoke(electronPluginInspect)
const startTrackingCursorPoint = useElectronEventaInvoke(electronStartTrackMousePosition)
const reportPluginCapability = useElectronEventaInvoke(electronPluginUpdateCapability)
const listMcpTools = useElectronEventaInvoke(electronMcpListTools)
const callMcpTool = useElectronEventaInvoke(electronMcpCallTool)
const setLocale = useElectronEventaInvoke(i18nSetLocale)
const openOnboarding = useElectronEventaInvoke(electronOpenOnboarding)

// NOTICE: register plugin host bridge during setup to avoid race with pages using it in immediate watchers.
pluginHostInspectorStore.setBridge({
  list: () => listPlugins(),
  setEnabled: payload => setPluginEnabled(payload),
  loadEnabled: () => loadEnabledPlugins(),
  load: payload => loadPlugin(payload),
  unload: payload => unloadPlugin(payload),
  inspect: () => inspectPluginHost(),
})

// NOTICE: MCP tools are declared from stage-ui and executed during model streaming.
// Register runtime bridge during setup to avoid missing bridge in early tool invocations.
setMcpToolBridge({
  listTools: () => listMcpTools(),
  callTool: payload => callMcpTool(payload),
})

watch(language, () => {
  i18n.locale.value = language.value
  setLocale(language.value)
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

onMounted(async () => {
  const startupAt = performance.now()
  const logStep = (label: string) => {
    console.log(`[App] ${label} (+${Math.round(performance.now() - startupAt)}ms)`)
  }

  logStep('onMounted start')
  proactivityStore.registerTools(widgetsTools)
  proactivityStore.startHeartbeatLoop()

  logStep('Initializing Analytics & Card stores')
  analyticsStore.initialize()
  cardStore.initialize()

  logStep('Initializing chat session')
  await chatSessionStore.initialize()
  logStep('Loading display models')
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  logStep('Initializing stage model')
  await settingsStore.initializeStageModel()

  logStep('Requesting server channel config')
  const serverChannelConfig = await getServerChannelConfig()
  logStep('Received server channel config')
  serverChannelSettingsStore.websocketTlsConfig = serverChannelConfig.websocketTlsConfig

  logStep('Initializing server channel store')
  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  logStep('Initializing context bridge')
  await contextBridgeStore.initialize()
  logStep('Initializing character orchestrator')
  characterOrchestratorStore.initialize()
  logStep('Starting cursor tracking')
  await startTrackingCursorPoint()
  logStep('Startup initialization complete')

  // Expose stage provider definitions to plugin host APIs.
  defineInvokeHandler(context.value, pluginProtocolListProviders, async () => listProvidersForPluginHost())

  if (shouldPublishPluginHostCapabilities()) {
    await reportPluginCapability({
      key: pluginProtocolListProvidersEventName,
      state: 'ready',
      metadata: {
        source: 'stage-ui',
      },
    })
  }

  // Broadcast Discord configuration if enabled
  if (discordStore.enabled) {
    discordStore.saveSettings()
  }

  // Listen for new modules joining and push config to Discord bot if it joins
  serverChannelStore.onEvent('registry:modules:sync', (event) => {
    const hasDiscord = event.data.modules.some(m => m.name === 'discord')
    if (hasDiscord && discordStore.enabled) {
      console.log('[App] Discord bot detected in registry, pushing configuration...')
      discordStore.saveSettings()
    }
  })

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

watch(() => onboardingStore.needsOnboarding, () => {
  if (onboardingStore.needsOnboarding) {
    openOnboarding()
  }
}, { immediate: true })

onUnmounted(() => {
  contextBridgeStore.dispose()
  clearMcpToolBridge()
  proactivityStore.stopHeartbeatLoop()
})
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <ResizeHandler />
  <RouterView />
</template>

<style>
/* We need this to properly animate the CSS variable */
@property --chromatic-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --chromatic-hue: 0;
  }
  to {
    --chromatic-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
