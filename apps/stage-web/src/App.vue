<script setup lang="ts">
import { OnboardingDialog, OnboardingStepAnalyticsNotice, StartupOverlay, ToasterRoot } from '@proj-airi/stage-ui/components'
import { useInferencePreload } from '@proj-airi/stage-ui/composables'
import { useStartupResourceTimeout } from '@proj-airi/stage-ui/composables/use-startup-resource-timeout'
import { usePiniaSynced } from '@proj-airi/stage-ui/libs/pinia'
import { initializeAnalytics, isAnalyticsAvailableInBuild } from '@proj-airi/stage-ui/libs/product-signals'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatStore } from '@proj-airi/stage-ui/stores/chat'
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
import { useStartupResourcesStore } from '@proj-airi/stage-ui/stores/startup-resources'
import { ErrorBoundary, useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRouter } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import PerformanceOverlay from './components/Devtools/PerformanceOverlay.vue'

import { usePWAStore } from './stores/pwa'

usePWAStore()

const contextBridgeStore = useContextBridgeStore()
const authStore = useAuthStore()
const i18n = useI18n()
const router = useRouter()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const chatStore = useChatStore()
const syncedPinia = usePiniaSynced()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { showingSetup } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const cardStore = useAiriCardStore()
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

const inferencePreload = useInferencePreload()
const startup = useStartupResourcesStore()
startup.reset()
startup.register(['auth', 'modelIndex', 'card', 'chat', 'services', 'modelData', 'modelSelection', 'audio', 'route', 'model'])
useStartupResourceTimeout('model', 120_000, () => i18n.t('stage.startup.model-timeout'))
const startupOnboarding = ref(false)
watch(showingSetup, (visible) => {
  if (!visible)
    startupOnboarding.value = false
})

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

const onboardingExtraSteps = computed(() => {
  return isAnalyticsAvailableInBuild()
    ? [{ id: 'analytics-notice', component: OnboardingStepAnalyticsNotice }]
    : []
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

async function loadStartup() {
  try {
    initializeAnalytics()
    await startup.run('auth', () => authStore.initialize())
    await startup.run('modelIndex', () => displayModelsStore.initialize())
    await startup.run('card', async () => {
      await cardStore.initialize()
      registerAuthenticatedSetup()
      if (!authStore.isAuthenticated)
        await removeAuthenticationProviderConfiguration()
    })
    await startup.run('chat', () => chatStore.initialize(syncedPinia))
    await startup.run('services', () => {
      void serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(error => console.error('Mods server initialization failed:', error))
      contextBridgeStore.initialize()
      characterOrchestratorStore.initialize()
    })
    await startup.run('modelData', () => displayModelsStore.loadDisplayModelsFromIndexedDB())
    await startup.run('modelSelection', () => settingsStore.initializeStageModel())
    await startup.run('audio', () => settingsAudioDeviceStore.initialize())
    inferencePreload.triggerPreload()
  }
  catch (error) {
    console.error('Startup failed:', error)
  }
}

onMounted(() => {
  void startup.run('route', () => router.isReady()).catch(error => console.error('Initial route failed:', error))
  void loadStartup()
})

watch(() => [startup.resources.find(resource => resource.id === 'modelSelection')?.status, startup.resources.find(resource => resource.id === 'route')?.status], ([selection, route]) => {
  if (selection !== 'ready' || route !== 'ready' || startup.resources.find(resource => resource.id === 'model')?.status !== 'queued')
    return
  if (router.currentRoute.value.name !== 'IndexScenePage' || settings.stageModelRenderer.value === 'disabled' || !settings.stageModelSelectedUrl.value)
    startup.skip('model')
  else
    startup.start('model')
})

onUnmounted(() => {
  stopAuthenticatedSetup?.()
  stopLoggedOutSetup?.()
  chatStore.dispose()
  contextBridgeStore.dispose()
})

function continueWithoutModel() {
  settingsStore.setStageModelRenderer('disabled')
  startup.skip('model')
}

function openOnboardingAfterStartup() {
  if (onboardingStore.needsOnboarding) {
    startupOnboarding.value = true
    onboardingStore.showingSetup = true
  }
}
</script>

<template>
  <StartupOverlay logo-src="/favicon.svg" @finished="openOnboardingAfterStartup" @skip-model="continueWithoutModel">
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
        <ErrorBoundary
          title="Something went wrong while rendering this page."
          @error="(err, _, info) => console.error('[ErrorBoundary]', info, err)"
        >
          <component :is="Component" />
        </ErrorBoundary>
      </RouterView>
    </StageTransitionGroup>

    <ToasterRoot @close="id => toast.dismiss(id)">
      <Toaster />
    </ToasterRoot>

    <!-- First Time Setup Dialog -->
    <OnboardingDialog
      v-model="showingSetup"
      :scale-background="false"
      :instant-open="startupOnboarding"
      :extra-steps="onboardingExtraSteps"
      @configured="onboardingStore.markSetupCompleted()"
      @skipped="onboardingStore.markSetupSkipped()"
    />

    <PerformanceOverlay />
  </StartupOverlay>
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
