<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
</script>

<template>
  <div
    flex="~ col" gap-3
    rounded-lg border="2 orange-200 dark:orange-800"
    bg="orange-50 dark:orange-950/30"
    p-6
  >
    <div flex items-center gap-2 text="orange-600 dark:orange-400">
      <div i-solar:usb-circle-bold-duotone text-xl />
      <h2 text-lg font-semibold>
        {{ t('settings.wip.title') }}
      </h2>
    </div>
    <p text="sm neutral-700 dark:neutral-300">
      {{ t('settings.wip.description') }}
    </p>
  </div>
</template>
