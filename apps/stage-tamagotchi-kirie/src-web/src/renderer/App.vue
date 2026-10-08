<script setup lang="ts">
import { useHostEventaContext, useHostLocale } from '@proj-airi/stage-host-context'
import { themeColorFromValue, useThemeColor } from '@proj-airi/stage-layouts/composables/theme-color'
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useInferencePreload } from '@proj-airi/stage-ui/composables'
import { usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { initializeAnalytics } from '@proj-airi/stage-ui/libs/product-signals'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { usePerfTracerBridgeStore } from '@proj-airi/stage-ui/stores/perf-tracer-bridge'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { ErrorBoundary, useTheme } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { onMounted, onUnmounted, shallowRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import MicrophonePermissionPrompt from './components/microphone-permission-prompt.vue'

import {
  electronChatReady,
  electronSettingsNavigate,
  electronSettingsReady,
} from '../shared/eventa'
import { initializeElectronAuthCallbackBridge } from './bridges/electron-auth-callback'
import { initializeStageThreeRuntimeTraceBridge } from './bridges/stage-three-runtime-trace'
import { useLanguage } from './composables/use-language'
import { initializeHostContext, startHostOwnedSpotlightShortcut, useHostMicrophonePermission } from './host-context'
import { useStageWindowLifecycleStore } from './stores/stage-window-lifecycle'
import { useTamagotchiBuiltinToolsStore } from './stores/tools/built-in'
import { resolveInitialRendererRoutePath, resolveRendererWindowContext } from './window-context'

const { isDark: dark } = useTheme()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const router = useRouter()
const route = useRoute()
const context = useHostEventaContext()
const hostContext = initializeHostContext()
const locale = useHostLocale()
const getMainLocale = locale.get
const setLocale = locale.set
const windowContext = resolveRendererWindowContext()
const initialRoutePath = resolveInitialRendererRoutePath(route.path)
const chatStore = useChatStore()
const builtinToolsStore = useTamagotchiBuiltinToolsStore()
const syncedPinia = usePiniaSynced()
const isSettingsWindow = initialRoutePath === '/settings' || initialRoutePath.startsWith('/settings/')
const isChatWindow = initialRoutePath === '/chat'
const isSpotlightWindow = initialRoutePath === '/spotlight'
const isMainRenderer = windowContext.leadership === 'leader-only'
const microphonePermission = useHostMicrophonePermission()
const microphonePermissionPrompt = microphonePermission.prompt
const microphonePermissionBusy = shallowRef(false)
const { t } = useI18n()
let stopSpotlightShortcut: (() => void) | undefined

if (isSpotlightWindow)
  document.documentElement.classList.add('spotlight-window')

watch(microphonePermission.status, (state, previousState) => {
  if (previousState !== 'granted' || state === 'granted')
    return

  const settingsAudioDeviceStore = useSettingsAudioDevice()
  settingsAudioDeviceStore.enabled = false
})

async function resolveMicrophonePermission(decision: 'granted' | 'denied') {
  if (microphonePermissionBusy.value)
    return

  microphonePermissionBusy.value = true
  try {
    await microphonePermission.resolvePrompt(decision)
  }
  catch (error) {
    console.error('[App] Failed to resolve microphone permission:', error)
  }
  finally {
    microphonePermissionBusy.value = false
  }
}

// Built-in tool execution belongs to the leader. Deferred sidecar tools have no host in this application.
const stopLeadershipListener = syncedPinia.onLeadershipChange((isLeader) => {
  if (!isLeader)
    return

  builtinToolsStore.refresh().catch((error) => {
    console.warn('[App] Failed to refresh built-in runtime tools:', error)
  })
})

function createFullStageRuntime() {
  const authStore = useAuthStore()
  const onboardingStore = useOnboardingStore()
  const displayModelsStore = useDisplayModelsStore()
  const cardStore = useAiriCardStore()
  const inferencePreload = useInferencePreload()
  const stageWindowLifecycleStore = useStageWindowLifecycleStore()
  const settingsAudioDeviceStore = useSettingsAudioDevice()
  useConsciousnessStore()
  useHearingStore()
  useSpeechStore()
  useSettingsStageModel()
  useVisionStore()

  let stopAuthenticatedSetup: (() => void) | undefined
  let stopLoggedOutSetup: (() => void) | undefined

  async function removeAuthenticationProviderConfiguration() {
    if (!syncedPinia.isLeader())
      return

    await cardStore.configureForAuthentication(false)
  }

  function registerAuthenticatedSetup() {
    stopAuthenticatedSetup ??= authStore.onAuthenticated(async () => {
      if (!syncedPinia.isLeader())
        return

      await cardStore.configureForAuthentication(true)
      await onboardingStore.closeAfterAuthentication()
    })
    stopLoggedOutSetup ??= authStore.onLogout(removeAuthenticationProviderConfiguration)
  }

  usePerfTracerBridgeStore()
  initializeStageThreeRuntimeTraceBridge()
  // The native host returns login callbacks to the initiating renderer.
  // Login windows listen locally. Synchronized auth actions execute in the leader.
  initializeElectronAuthCallbackBridge()
  stageWindowLifecycleStore.initializeWindowLifecycleBridge().catch((error) => {
    console.error('[App] Failed to initialize native window lifecycle:', error)
  })

  return {
    async initialize() {
      initializeAnalytics()
      await authStore.initialize()
      await displayModelsStore.initialize()
      await cardStore.initialize()
      registerAuthenticatedSetup()
      if (!authStore.isAuthenticated)
        await removeAuthenticationProviderConfiguration()

      await displayModelsStore.loadDisplayModelsFromIndexedDB()
      await settingsStore.initializeStageModel()
      await settingsAudioDeviceStore.initialize()

      if (!isMainRenderer)
        return

      await inferencePreload.triggerPreload()
    },
    dispose() {
      stopAuthenticatedSetup?.()
      stopLoggedOutSetup?.()
    },
  }
}

const fullStageRuntime = windowContext.stageRuntime === 'full'
  ? createFullStageRuntime()
  : null

const { restore: restoreLocale } = useLanguage(language, getMainLocale, setLocale)

const { updateThemeColor } = useThemeColor(themeColorFromValue(
  isSpotlightWindow
    ? { light: 'rgb(255 255 255 / 0)', dark: 'rgb(18 18 18 / 0)' }
    : { light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' },
))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

if (isSettingsWindow) {
  context.value.on(electronSettingsNavigate, (event) => {
    const targetRoute = event?.body?.route
    if (!targetRoute || route.fullPath === targetRoute) {
      return
    }

    router.push(targetRoute).catch((error) => {
      console.warn('Failed to navigate settings window:', error)
    })
  })
  context.value.emit(electronSettingsReady, {})
}

if (isChatWindow) {
  context.value.emit(electronChatReady, {})
}

onMounted(async () => {
  // Restore persisted locale before synchronized language watchers start.
  await restoreLocale()

  if (isMainRenderer) {
    stopSpotlightShortcut = startHostOwnedSpotlightShortcut({
      onRegistrationFailed(error) {
        console.warn('[App] Failed to register the Spotlight shortcut:', error)
        hostContext.platform.notifications.show({
          body: t('tamagotchi.settings.spotlight.errors.shortcutRegistrationFailed'),
          id: 'spotlight-shortcut-failed',
          title: 'AIRI',
        }).catch((notificationError) => {
          console.warn('[App] Failed to show the Spotlight shortcut error notification:', notificationError)
        })
      },
    })
  }

  await microphonePermission.refresh().catch((error) => {
    console.warn('[App] Failed to load microphone permission state:', error)
  })

  await chatStore.initialize(syncedPinia)
  await fullStageRuntime?.initialize()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onUnmounted(() => {
  stopSpotlightShortcut?.()
  stopLeadershipListener?.()
  chatStore.dispose()
  fullStageRuntime?.dispose()
})

function handleRouteRenderError(error: unknown, _instance: unknown, info: string) {
  console.error(`[App] Failed to render route ${route.fullPath} during ${info}:`, error)
}
</script>

<template>
  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>
  <MicrophonePermissionPrompt
    v-if="isMainRenderer && microphonePermission"
    :busy="microphonePermissionBusy"
    :open="Boolean(microphonePermissionPrompt)"
    @allow="resolveMicrophonePermission('granted')"
    @deny="resolveMicrophonePermission('denied')"
  />
  <RouterView v-slot="{ Component }">
    <ErrorBoundary
      :key="route.fullPath"
      title="This page could not be displayed."
      @error="handleRouteRenderError"
    >
      <component :is="Component" />
    </ErrorBoundary>
  </RouterView>
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
