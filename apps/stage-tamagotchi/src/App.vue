<script setup lang="ts">
import type { AiriTamagotchiEvents } from './composables/tauri'

import { useDisplayModelsStore } from '@proj-airi/stage-ui/stores/display-models'
import { useMcpStore } from '@proj-airi/stage-ui/stores/mcp'
import { useOnboardingStore } from '@proj-airi/stage-ui/stores/onboarding'
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { Window } from '@tauri-apps/api/window'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { commands } from './bindings/tauri-plugins/window-router-link'
import { useAppRuntime } from './composables/runtime'
import { useTauriEvent } from './composables/tauri'
import { useWindowMode } from './stores/window-controls'

useWindowMode()
const i18n = useI18n()
const displayModelsStore = useDisplayModelsStore()
const settingsStore = useSettings()
const { language, themeColorsHue, themeColorsHueDynamic, allowVisibleOnAllWorkspaces } = storeToRefs(settingsStore)
const onboardingStore = useOnboardingStore()
const { shouldShowSetup } = storeToRefs(onboardingStore)

const mcpStore = useMcpStore()
const { listen } = useTauriEvent<AiriTamagotchiEvents>()
const { platform } = useAppRuntime()

watch(language, () => {
  i18n.locale.value = language.value
})

// FIXME: store settings to file
onMounted(async () => {
  onboardingStore.initializeSetupCheck()

  await displayModelsStore.loadDisplayModelsFromIndexedDB()
  await settingsStore.initializeStageModel()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

watch(shouldShowSetup, () => {
  if (shouldShowSetup.value) {
    commands.go('/onboarding', 'onboarding')
  }
})

onMounted(() => {
  listen('mcp_plugin_destroyed', () => {
    mcpStore.connected = false
  })
})

const isMac = computed(() => platform.value === 'macos')

if (isMac.value) {
  watch(allowVisibleOnAllWorkspaces, async (value) => {
    const window = await Window.getByLabel('main')

    if (!window) {
      return
    }

    window.setVisibleOnAllWorkspaces(value)
  })
}
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
