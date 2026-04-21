<script setup lang="ts">
import { OnboardingDialog, OnboardingStepAnalyticsNotice, ToasterRoot } from '@proj-airi/stage-ui/components'
import { useInferencePreload } from '@proj-airi/stage-ui/composables'
import { isPosthogAvailableInBuild, useSharedAnalyticsStore } from '@proj-airi/stage-ui/stores/analytics'
import { useCharacterOrchestratorStore } from '@proj-airi/stage-ui/stores/character'
import { useChatSessionStore } from '@proj-airi/stage-ui/stores/chat/session-store'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useModsServerChannelStore } from '@proj-airi/stage-ui/stores/mods/api/channel-server'
import { useContextBridgeStore } from '@proj-airi/stage-ui/stores/mods/api/context-bridge'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import PerformanceOverlay from './components/Devtools/PerformanceOverlay.vue'

import { usePWAStore } from './stores/pwa'

usePWAStore()

const contextBridgeStore = useContextBridgeStore()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const chatSessionStore = useChatSessionStore()
const serverChannelStore = useModsServerChannelStore()
const characterOrchestratorStore = useCharacterOrchestratorStore()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const { showingSetup } = storeToRefs(onboardingStore)
const { isDark } = useTheme()
const cardStore = useAiriCardStore()
const analyticsStore = useSharedAnalyticsStore()
const inferencePreload = useInferencePreload()

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
  return isPosthogAvailableInBuild()
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

// Initialize first-time setup check when app mounts
onMounted(async () => {
  analyticsStore.initialize()
  await displayModelsStore.initialize()
  cardStore.initialize()

  if (onboardingStore.needsOnboarding) {
    onboardingStore.showingSetup = true
  }

  await chatSessionStore.initialize()
  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
  await settingsAudioDeviceStore.initialize()

  // Preload local inference models (Kokoro TTS, etc.) in background after a delay
  inferencePreload.triggerPreload()
})

onUnmounted(() => {
  contextBridgeStore.dispose()
})

// Handle first-time setup events
function handleSetupConfigured() {
  onboardingStore.markSetupCompleted()
}

function handleSetupSkipped() {
  onboardingStore.markSetupSkipped()
}
</script>

<template>
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
      <component :is="Component" />
    </RouterView>
  </StageTransitionGroup>

  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>

  <!-- First Time Setup Dialog -->
  <OnboardingDialog
    v-model="showingSetup"
    :extra-steps="onboardingExtraSteps"
    @configured="handleSetupConfigured"
    @skipped="handleSetupSkipped"
  />

  <PerformanceOverlay />
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
