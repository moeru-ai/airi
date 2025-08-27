<script setup lang="ts">
import { OnboardingDialog, ToasterRoot } from '@proj-airi/stage-ui/components'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'
import { toast, Toaster } from 'vue-sonner'

import { usePWAStore } from './stores/pwa'

import 'vue-sonner/style.css'

usePWAStore()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const settings = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const { shouldShowSetup } = storeToRefs(onboardingStore)
const isDark = useDark()

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

// Initialize first-time setup check when app mounts
onMounted(async () => {
  onboardingStore.initializeSetupCheck()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
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
      <KeepAlive :include="/IndexScenePage|StageScenePage/">
        <component :is="Component" />
      </KeepAlive>
    </RouterView>
  </StageTransitionGroup>

  <ToasterRoot @close="id => toast.dismiss(id)">
    <Toaster />
  </ToasterRoot>

  <!-- First Time Setup Dialog -->
  <OnboardingDialog
    v-model="shouldShowSetup"
    @configured="handleSetupConfigured"
    @skipped="handleSetupSkipped"
  />
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
