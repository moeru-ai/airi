<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores'
import { onMounted, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

const settings = useSettings()
const i18n = useI18n()

watch(() => settings.language, (language) => {
  i18n.locale.value = language
  window.electron.ipcRenderer.send('locale-changed', language)
})

// FIXME: store settings to file
onMounted(() => {
  window.electron.ipcRenderer.send('locale-changed', settings.language)
})
</script>

<template>
  <RouterView />
</template>
