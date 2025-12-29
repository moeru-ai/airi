<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// TODO: Desktop lag overlay/parity with web implementation.
const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-3" pb-6>
    <div text="lg neutral-100">
      {{ t('tamagotchi.settings.devtools.pages.lag-visualizer.title') }}
    </div>
    <div text="sm neutral-400" flex="~ col gap-1">
      <span>{{ t('tamagotchi.settings.devtools.pages.lag-visualizer.description') }}</span>
      <span>{{ t('settings.wip.description') }}</span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
