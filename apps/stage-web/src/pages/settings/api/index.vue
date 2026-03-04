<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import APISettings from '@proj-airi/stage-ui/components/scenarios/settings/api-settings.vue'

const { t } = useI18n()
</script>

<template>
  <div flex="~ col gap-6" font-normal>
    <div>
      <h1 font="bold text-3xl">API 设置</h1>
      <p text="neutral-500 dark:neutral-400">配置AI服务的API信息，确保稳定连接</p>
    </div>

    <APISettings />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.api.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.api.description
  icon: i-solar:server-bold-duotone
  settingsEntry: true
  order: 5
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>