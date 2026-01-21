<script setup lang="ts">
// NOTICE: This view is defined for parity but not used by stage-tamagotchi yet.
import { useI18n } from 'vue-i18n'

// TODO: Desktop lag overlay/parity with web implementation.
const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-3" pb-6>
    <div text="lg neutral-100">
      {{ t('tamagotchi.settings.devtools.pages.performance-visualizer.title') }}
    </div>
    <div text="sm neutral-400" flex="~ col gap-1">
      <span>{{ t('tamagotchi.settings.devtools.pages.performance-visualizer.description') }}</span>
      <span>{{ t('settings.wip.description') }}</span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: tamagotchi.settings.devtools.pages.lag-visualizer.title
  subtitleKey: tamagotchi.settings.devtools.title
</route>
