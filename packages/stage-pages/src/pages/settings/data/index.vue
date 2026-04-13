<script setup lang="ts">
import ChatsSection from './components/chats-section.vue'
import DangerSection from './components/danger-section.vue'
import ModelsModulesSection from './components/models-modules-section.vue'
import StatusBanner from './components/status-banner.vue'

import { createDataSettingsStatusState } from './status'

const { statusMessage, statusTone, handleStatus } = createDataSettingsStatusState()
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-4']">
    <StatusBanner v-if="statusMessage" :message="statusMessage" :tone="statusTone" />
    <ChatsSection @status="handleStatus" />
    <ModelsModulesSection @status="handleStatus" />
    <DangerSection @status="handleStatus" />
  </div>
</template>

<route lang="yaml">
meta:
  layout: settings
  titleKey: settings.pages.data.title
  subtitleKey: settings.title
  descriptionKey: settings.pages.data.description
  icon: i-solar:database-bold-duotone
  settingsEntry: true
  order: 7
  stageTransition:
    name: slide
    pageSpecificAvailable: true
</route>
