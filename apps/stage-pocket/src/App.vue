<script setup lang="ts">
import type { StartupSceneState } from '@proj-airi/stage-ui/composables/startup-scene'
import type { Ref } from 'vue'

import { OnboardingDialog, OnboardingStepAnalyticsNotice, StartupScreenProvider, ToasterRoot } from '@proj-airi/stage-ui/components'
import { createStartupProgress } from '@proj-airi/stage-ui/composables/startup-progress'
import { usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { initializeAnalytics, isAnalyticsAvailableInBuild } from '@proj-airi/stage-ui/libs/product-signals'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useArtistryStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { useConsciousnessStore } from '@proj-airi/stage-ui/stores/modules/consciousness'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useVisionStore } from '@proj-airi/stage-ui/stores/modules/vision'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useSettingsStageModel } from '@proj-airi/stage-ui/stores/settings/stage-model'
import { useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { until } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import OnboardingPermissionsStep from './components/onboarding/step-permissions.vue'

import { getHostWebSocketConnector } from './modules/websocket-bridge'

const contextBridgeStore = useContextBridgeStore()
const authStore = useAuthStore()
const i18n = useI18n()
const router = useRouter()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const syncedPinia = usePiniaSynced()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { showingSetup } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const cardStore = useAiriCardStore()
const startup = createStartupProgress([
  { id: 'auth', requires: [] },
  { id: 'modelIndex', requires: ['auth'] },
  { id: 'card', requires: ['auth'] },
  { id: 'services', requires: ['card'] },
  { id: 'modelData', requires: ['modelIndex', 'services'] },
  { id: 'modelSelection', requires: ['modelData'] },
  { id: 'audio', requires: ['modelSelection'] },
  { id: 'route', requires: [] },
  { id: 'scene', requires: ['modelSelection', 'route'] },
] as const)
const startupProgress = startup.progress
const startupOnboarding = ref(false)
watch(showingSetup, (visible) => {
  if (!visible)
    startupOnboarding.value = false
})
useArtistryStore()
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

const primaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${0})) 90%, oklch(90% 0 360))`
})

const secondaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${180})) 90%, oklch(90% 0 360))`
})

const tertiaryColor = computed(() => {
  return isDark.value
    ? `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 70%, oklch(50% 0 360))`
    : `color-mix(in srgb, oklch(95% var(--chromatic-chroma-900) calc(var(--chromatic-hue) + ${60})) 90%, oklch(90% 0 360))`
})

const colors = computed(() => {
  return [primaryColor.value, secondaryColor.value, tertiaryColor.value, isDark.value ? '#121212' : '#FFFFFF']
})

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})

watch(settings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', settings.themeColorsHue.value.toString())
}, { immediate: true })

watch(settings.themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', settings.themeColorsHueDynamic.value)
}, { immediate: true })

async function loadStartup(sceneState: Ref<StartupSceneState>) {
  try {
    initializeAnalytics()
    await authStore.initialize()
    startup.complete('auth')
    await displayModelsStore.initialize()
    startup.complete('modelIndex')
    await cardStore.initialize()
    registerAuthenticatedSetup()
    if (!authStore.isAuthenticated)
      await removeAuthenticationProviderConfiguration()
    startup.complete('card')

    await serverChannelStore.initialize({
      possibleEvents: ['ui:configure'],
      connector: getHostWebSocketConnector,
    }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
    contextBridgeStore.initialize()
    characterOrchestratorStore.initialize()
    startup.complete('services')

    await displayModelsStore.loadDisplayModelsFromIndexedDB()
    startup.complete('modelData')
    await settingsStore.initializeStageModel()
    startup.complete('modelSelection')
    await settingsAudioDeviceStore.initialize()
    startup.complete('audio')
  }
  finally {
    await router.isReady().then(
      () => { startup.complete('route') },
      error => console.error('Failed to load initial route:', error),
    )
    if (startup.isComplete('modelSelection') && startup.isComplete('route') && router.currentRoute.value.name === 'IndexScenePage' && settings.stageModelRenderer.value !== 'disabled' && settings.stageModelSelectedUrl.value) {
      await until(sceneState).toMatch(state => state === 'mounted' || state === 'error')
      if (sceneState.value === 'mounted')
        startup.complete('scene')
    }
    else if (startup.isComplete('modelSelection') && startup.isComplete('route')) {
      startup.complete('scene')
    }
  }
}

onUnmounted(() => {
  stopAuthenticatedSetup?.()
  stopLoggedOutSetup?.()
  contextBridgeStore.dispose()
})

function openOnboardingAfterStartup() {
  if (onboardingStore.needsOnboarding) {
    startupOnboarding.value = true
    onboardingStore.showingSetup = true
  }
}

const extraSteps = computed(() => [
  ...(
    isAnalyticsAvailableInBuild()
      ? [{ id: 'analytics-notice', component: OnboardingStepAnalyticsNotice }]
      : []
  ),
  {
    id: 'step-permissions',
    component: OnboardingPermissionsStep,
  },
])
</script>

<template>
  <StartupScreenProvider
    :progress="startupProgress"
    :load="loadStartup"
    :instant-exit="onboardingStore.needsOnboarding"
    logo-src="/favicon.svg"
    :label="i18n.t('stage.operations.load-models-status.loading')"
    @hidden="openOnboardingAfterStartup"
  >
    <StageTransitionGroup
      :primary-color="primaryColor"
      :secondary-color="secondaryColor"
      :tertiary-color="tertiaryColor"
      :colors="colors"
      :z-index="100"
      :disable-transitions="settings.disableTransitions.value"
      :use-page-specific-transitions="settings.usePageSpecificTransitions.value"
    >
      <RouterView v-slot="{ Component }">
        <KeepAlive :include="['IndexScenePage', 'StageScenePage']">
          <component :is="Component" />
        </KeepAlive>
      </RouterView>
    </StageTransitionGroup>

    <ToasterRoot @close="id => toast.dismiss(id)">
      <Toaster rich-colors />
    </ToasterRoot>

    <!-- First Time Setup Dialog -->
    <OnboardingDialog
      v-model="showingSetup"
      :scale-background="false"
      :instant-open="startupOnboarding"
      :extra-steps="extraSteps"
      @configured="onboardingStore.markSetupCompleted()"
      @skipped="onboardingStore.markSetupSkipped()"
    />
  </StartupScreenProvider>
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
