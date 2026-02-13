<script setup lang="ts">
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { listProvidersForPluginHost, shouldPublishPluginHostCapabilities } from '@proj-airi/stage-ui/stores/plugin-host-capabilities'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import ResizeHandler from './components/ResizeHandler.vue'

import {
  electronOpenSettings,
  electronPluginUpdateCapability,
  electronStartTrackMousePosition,
  electronStartWebSocketServer,
  pluginProtocolListProviders,
  pluginProtocolListProvidersEventName,
} from '../shared/eventa'
import { useElectronEventaContext, useElectronEventaInvoke } from './composables/electron-vueuse'

const { isDark: dark } = useTheme()
const i18n = useI18n()
const contextBridgeStore = useContextBridgeStore()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()
const cardStore = useAiriCardStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const analyticsStore = useSharedAnalyticsStore()
usePerfTracerBridgeStore()

watch(language, () => {
  i18n.locale.value = language.value
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

const startWebSocketServer = useElectronEventaInvoke(electronStartWebSocketServer)

onMounted(async () => {
  analyticsStore.initialize()
  cardStore.initialize()
  onboardingStore.initializeSetupCheck()

  await chatSessionStore.initialize()
  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
  await startWebSocketServer({ websocketSecureEnabled: settingsStore.websocketSecureEnabled })

  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  await contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  const context = useElectronEventaContext()
  const startTrackingCursorPoint = defineInvoke(context.value, electronStartTrackMousePosition)
  const reportPluginCapability = defineInvoke(context.value, electronPluginUpdateCapability)
  await startTrackingCursorPoint()

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

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => contextBridgeStore.dispose())
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
