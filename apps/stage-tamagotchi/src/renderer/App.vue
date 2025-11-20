<script setup lang="ts">
import { defineInvoke, defineInvokeHandler } from '@moeru/eventa'
import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView, useRoute, useRouter } from 'vue-router'

import { electronOpenSettings, electronStartTrackMousePosition } from '../shared/eventa'
import { useElectronEventaContext } from './composables/electron-vueuse'
import { themeColorFromValue, useThemeColor } from './composables/theme-color'

const dark = useDark({ disableTransition: false })
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const router = useRouter()
const route = useRoute()

watch(language, () => {
  i18n.locale.value = language.value
})

const { updateThemeColor } = useThemeColor(themeColorFromValue({ light: 'rgb(255 255 255)', dark: 'rgb(18 18 18)' }))
watch(dark, () => updateThemeColor(), { immediate: true })
watch(route, () => updateThemeColor(), { immediate: true })
onMounted(() => updateThemeColor())

// FIXME: store settings to file
onMounted(async () => {
  onboardingStore.initializeSetupCheck()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()

  const context = useElectronEventaContext()
  const startTrackingCursorPoint = defineInvoke(context.value, electronStartTrackMousePosition)
  await startTrackingCursorPoint()

  // Listen for open-settings IPC message from main process
  defineInvokeHandler(context.value, electronOpenSettings, () => router.push('/settings'))
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
