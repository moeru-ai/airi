<script setup lang="ts">
import { useMcpStore, useSettings } from '@proj-airi/stage-ui/stores'
import { listen } from '@tauri-apps/api/event'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useWindowControlStore } from './stores/window-controls'

const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(useSettings())
const i18n = useI18n()
const windowControlStore = useWindowControlStore()
const mcpStore = useMcpStore()

useEventListener(window, 'resize', () => {
  windowControlStore.size.width = window.innerWidth
  windowControlStore.size.height = window.innerHeight
})

watch(language, (language) => {
  i18n.locale.value = language
})

// FIXME: store settings to file
onMounted(() => {
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeColorsHue.value.toString())
}, { immediate: true })

watch(themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeColorsHueDynamic.value)
}, { immediate: true })

listen('mcp_plugin_destroyed', () => {
  mcpStore.connected = false
})
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
