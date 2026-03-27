<script setup lang="ts">
import { isStageWeb } from '@proj-airi/stage-shared'
import { MessagingQQ } from '@proj-airi/stage-ui/components'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const isWeb = computed(() => isStageWeb())
</script>

<template>
  <div
    v-if="isWeb"
    :class="[
      'border-2 border-amber-300/80 rounded-xl p-4',
      'bg-amber-50/80 shadow-sm',
      'dark:border-amber-500/60 dark:bg-amber-500/10',
    ]"
  >
    <p :class="['text-sm text-amber-700 font-medium dark:text-amber-200']">
      {{ t('settings.pages.modules.messaging-qq.web-not-supported') }}
    </p>
  </div>
  <MessagingQQ />
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.modules.messaging-qq.title
  subtitleKey: settings.title
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
