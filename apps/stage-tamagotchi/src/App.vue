<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useEventListener } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useWindowControlStore } from './stores/window-controls'

const { language, themeColorsHue, themeColorsHueDynamic } = storeToRefs(useSettings())
const i18n = useI18n()
const windowControlStore = useWindowControlStore()

useEventListener(window, 'resize', () => {
  windowControlStore.size.width = window.innerWidth
  windowControlStore.size.height = window.innerHeight
})

watch(language, (language) => {
  i18n.locale.value = language
  // window.electron.ipcRenderer.send('locale-changed', language)
})

// FIXME: store settings to file
onMounted(() => {
  // window.electron.ipcRenderer.send('locale-changed', language.value)
  // window.electron.ipcRenderer.send('window-size-changed', windowControlStore.size.width, windowControlStore.size.height)
  // window.electron.ipcRenderer.send('window-position-changed', windowControlStore.position.x, windowControlStore.position.y)
})

watch(themeColorsHue, () => {
  document.documentElement.style.setProperty('--theme-colors-hue', themeColorsHue.value.toString())
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
@property --theme-colors-hue {
  syntax: '<number>';
  initial-value: 0;
  inherits: true;
}

@keyframes hue-anim {
  from {
    --theme-colors-hue: 0;
  }
  to {
    --theme-colors-hue: 360;
  }
}

.dynamic-hue {
  animation: hue-anim 10s linear infinite;
}
</style>
