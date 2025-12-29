<script setup lang="ts">
import { useI18n } from 'vue-i18n'

// TODO: Desktop markdown stress harness + IPC stress once design is ready.
const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-3" pb-6>
    <div text="lg neutral-100">
      {{ t('tamagotchi.settings.devtools.pages.markdown-stress.title') }}
    </div>
    <div text="sm neutral-400" flex="~ col gap-1">
      <span>{{ t('tamagotchi.settings.devtools.pages.markdown-stress.description') }}</span>
      <span>{{ t('settings.wip.description') }}</span>
    </div>
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
</route>
