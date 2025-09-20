<script setup lang="ts">
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { defineInvoke } from '@unbird/eventa'
import { createContext } from '@unbird/eventa/adapters/electron/renderer'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { electronStartTrackingCursorPoint } from '../shared/eventa'
import { useWindowMode } from './stores/window-controls'

useWindowMode()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()

watch(language, () => {
  i18n.locale.value = language.value
})

// FIXME: store settings to file
onMounted(async () => {
  onboardingStore.initializeSetupCheck()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()

  const { context } = createContext(window.electron.ipcRenderer)
  const startTrackingCursorPoint = defineInvoke(context, electronStartTrackingCursorPoint)
  await startTrackingCursorPoint(undefined)
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })
</script>

<template>
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
