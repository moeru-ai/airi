<script setup lang="ts">
import type { AiriTamagotchiEvents } from './composables/tauri'

import { FirstTimeSetupDialog } from '@proj-airi/stage-ui/components'
import { useFirstTimeSetupStore, useMcpStore, useSettings } from '@proj-airi/stage-ui/stores'
import { Window } from '@tauri-apps/api/window'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useAppRuntime } from './composables/runtime'
import { useTauriEvent } from './composables/tauri'
import { useWindowControlStore } from './stores/window-controls'

const { language, themeColorsHue, themeColorsHueDynamic, allowVisibleOnAllWorkspaces } = storeToRefs(useSettings())
const i18n = useI18n()
const windowControlStore = useWindowControlStore()
const mcpStore = useMcpStore()
const firstTimeSetupStore = useFirstTimeSetupStore()
const { shouldShowSetup } = storeToRefs(firstTimeSetupStore)
const { platform } = useAppRuntime()
const { listen } = useTauriEvent<AiriTamagotchiEvents>()

useEventListener(window, 'resize', () => {
  windowControlStore.size.width = window.innerWidth
  windowControlStore.size.height = window.innerHeight
})

watch(language, () => {
  i18n.locale.value = language.value
})

// FIXME: store settings to file
onMounted(() => {
  // Initialize first-time setup check
  firstTimeSetupStore.initializeSetupCheck()
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

onMounted(() => {
  listen('mcp_plugin_destroyed', () => {
    mcpStore.connected = false
  })
})

// Handle first-time setup events
function handleSetupConfigured() {
  firstTimeSetupStore.markSetupCompleted()
}

function handleSetupSkipped() {
  firstTimeSetupStore.markSetupSkipped()
}

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

  <!-- First Time Setup Dialog -->
  <FirstTimeSetupDialog
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
