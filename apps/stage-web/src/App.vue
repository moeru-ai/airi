<script setup lang="ts">
import { useSettings } from '@proj-airi/stage-ui/stores/settings'
import { StageTransitionGroup } from '@proj-airi/ui-transitions'
import { useDark } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterView } from 'vue-router'

const i18n = useI18n()
const settings = storeToRefs(useSettings())
const isDark = useDark()

watch(settings.language, () => {
  i18n.locale.value = settings.language.value
})

watch(settings.themeColorsHue, () => {
  document.documentElement.style.setProperty('--theme-colors-hue', settings.themeColorsHue.value.toString())
}, { immediate: true })
</script>

<template>
  <StageTransitionGroup
    primary-color="#FF57C8"
    secondary-color="#946BFF"
    tertiary-color="#121212"
    :colors="!isDark ? ['#FF57C8', '#946BFF', '#64BCFF', '#FFFFFF'] : ['#FF57C8', '#946BFF', '#64BCFF', '#121212']"
    :z-index="100"
    :disable-transitions="settings.disableTransitions.value"
  >
    <RouterView />
  </StageTransitionGroup>
</template>
