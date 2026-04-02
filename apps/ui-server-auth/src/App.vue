<script setup lang="ts">
import { ToasterRoot } from '@proj-airi/stage-ui/components'
import { useSettingsGeneral, useSettingsTheme } from '@proj-airi/stage-ui/stores/settings'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { toast, Toaster } from 'vue-sonner'

const i18n = useI18n()
const generalStore = useSettingsGeneral()
const settings = storeToRefs(generalStore)
const themeStore = useSettingsTheme()
const themeSettings = storeToRefs(themeStore)

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})

watch(themeSettings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--chromatic-hue', themeSettings.themeColorsHue.value.toString())
}, { immediate: true })

watch(themeSettings.themeColorsHueDynamic, () => {
  document.documentElement.classList.toggle('dynamic-hue', themeSettings.themeColorsHueDynamic.value)
}, { immediate: true })
</script>

<template>
  <div>
    <ToasterRoot @close="id => toast.dismiss(id)">
      <Toaster />
    </ToasterRoot>
  </div>
</template>
