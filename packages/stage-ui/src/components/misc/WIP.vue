<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import Callout from '../layouts/Callout.vue'

const { t } = useI18n()
</script>

<template>
  <Callout theme="orange">
    <template #label>
      <div flex items-center gap-2 text="orange-600 dark:orange-400">
        <div i-solar:usb-circle-bold-duotone text-xl />
        <span font-semibold>
          {{ t('settings.wip.title') }}
        </span>
      </div>
    </template>
    <p text="sm neutral-700 dark:neutral-300">
      {{ t('settings.wip.description') }}
    </p>
  </Callout>
</template>
