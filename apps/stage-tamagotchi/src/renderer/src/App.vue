<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { useEventListener } from '@vueuse/core'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

import { useWindowControlStore } from './stores/window-controls'

const settings = useSettings()
const i18n = useI18n()
const windowControlStore = useWindowControlStore()

useEventListener(window, 'resize', () => {
  windowControlStore.size.width = window.innerWidth
  windowControlStore.size.height = window.innerHeight
})

watch(() => settings.language, (language) => {
  i18n.locale.value = language
  window.electron.ipcRenderer.send('locale-changed', language)
})

// FIXME: store settings to file
onMounted(() => {
  window.electron.ipcRenderer.send('locale-changed', settings.language)
  window.electron.ipcRenderer.send('window-size-changed', windowControlStore.size.width, windowControlStore.size.height)
  window.electron.ipcRenderer.send('window-position-changed', windowControlStore.position.x, windowControlStore.position.y)
})
</script>

<template>
  <RouterView />
</template>
