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
import { bootstrapPepTutorVoiceEnvDefaults } from '@proj-airi/stage-ui/stores/provider-env-bootstrap'
import { useSettings, useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { isLessonPath, isLessonRouteLike } from '@proj-airi/stage-ui/utils'
import { useTheme } from '@proj-airi/ui'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { storeToRefs } from 'pinia'
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import PerformanceOverlay from './components/Devtools/PerformanceOverlay.vue'

import { usePWAStore } from './stores/pwa'
import { shouldSuppressOnboardingForRoute } from './utils/onboarding-route'

usePWAStore()

const route = useRoute()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settingsAudioDeviceStore = useSettingsAudioDevice()
const settings = storeToRefs(settingsStore)
const { isDark } = useTheme()
const analyticsStore = useSharedAnalyticsStore()
const inferencePreload = useInferencePreload()
const lessonLiteEnabled = computed(() =>
  isLessonRouteLike(route)
  || (typeof window !== 'undefined' && isLessonPath(window.location.pathname)),
)
const showingSetup = ref(false)
const needsOnboarding = ref(false)
let voiceEnvBootstrapped = false
let globalRuntimeInitialized = false
let onboardingStoreInitialized = false
let onboardingStore: ReturnType<typeof useOnboardingStore> | null = null
let cardStore: ReturnType<typeof useAiriCardStore> | null = null
let chatSessionStore: ReturnType<typeof useChatSessionStore> | null = null
let serverChannelStore: ReturnType<typeof useModsServerChannelStore> | null = null
let contextBridgeStore: ReturnType<typeof useContextBridgeStore> | null = null
let characterOrchestratorStore: ReturnType<typeof useCharacterOrchestratorStore> | null = null

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

const suppressOnboardingForCurrentRoute = computed(() => shouldSuppressOnboardingForRoute(route))

watch([needsOnboarding, suppressOnboardingForCurrentRoute], ([needSetup, suppress]) => {
  if (!lessonLiteEnabled.value) {
    showingSetup.value = needSetup && !suppress
  }
}, { immediate: true })

function ensureCardStore() {
  cardStore ??= useAiriCardStore()
  cardStore.initialize()
  return cardStore
}

function ensureOnboardingStore() {
  onboardingStore ??= useOnboardingStore()

  if (!onboardingStoreInitialized) {
    onboardingStoreInitialized = true
    const onboardingRefs = storeToRefs(onboardingStore)

    watch(onboardingRefs.needsOnboarding, (value) => {
      needsOnboarding.value = value
    }, { immediate: true })

    watch(onboardingRefs.showingSetup, (value) => {
      if (showingSetup.value !== value) {
        showingSetup.value = value
      }
    }, { immediate: true })

    watch(showingSetup, (value) => {
      if (onboardingRefs.showingSetup.value !== value) {
        onboardingRefs.showingSetup.value = value
      }
    })
  }

  return onboardingStore
}

async function initializeGlobalRuntime() {
  if (lessonLiteEnabled.value || globalRuntimeInitialized) {
    return
  }

  ensureOnboardingStore()
  ensureCardStore()
  chatSessionStore ??= useChatSessionStore()
  serverChannelStore ??= useModsServerChannelStore()
  contextBridgeStore ??= useContextBridgeStore()
  characterOrchestratorStore ??= useCharacterOrchestratorStore()

  if (!voiceEnvBootstrapped) {
    await bootstrapPepTutorVoiceEnvDefaults()
    voiceEnvBootstrapped = true
  }

  await chatSessionStore.initialize()
  await serverChannelStore.initialize({ possibleEvents: ['ui:configure'] }).catch(err => console.error('Failed to initialize Mods Server Channel in App.vue:', err))
  contextBridgeStore.initialize()
  characterOrchestratorStore.initialize()
  globalRuntimeInitialized = true
}

onMounted(async () => {
  analyticsStore.initialize()
  await displayModelsStore.initialize()
  await initializeGlobalRuntime()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
  await settingsAudioDeviceStore.initialize()

  inferencePreload.triggerPreload()
})

watch(lessonLiteEnabled, (enabled) => {
  if (!enabled) {
    void initializeGlobalRuntime()
  }
})

onUnmounted(() => {
  contextBridgeStore?.dispose()
})

function handleSetupConfigured() {
  ensureOnboardingStore().markSetupCompleted()
}

function handleSetupSkipped() {
  ensureOnboardingStore().markSetupSkipped()
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

  <OnboardingDialog
    v-if="!lessonLiteEnabled"
    v-model="showingSetup"
    :extra-steps="onboardingExtraSteps"
    @configured="handleSetupConfigured"
    @skipped="handleSetupSkipped"
  />

  <PerformanceOverlay />
</template>

<style>
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
