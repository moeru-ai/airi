<script setup lang="ts">
import type { AlertTone } from '@proj-airi/ui'

import type { DataSettingsStatusTone } from './status'

import { Alert } from '@proj-airi/ui'
import { computed } from 'vue'

import ChatsSection from './components/chats-section.vue'
import DangerSection from './components/danger-section.vue'
import DownloadedModelsSection from './components/downloaded-models-section.vue'
import ModelsModulesSection from './components/models-modules-section.vue'

import { createDataSettingsStatusState } from './status'

const { statusMessage, statusTone, handleStatus } = createDataSettingsStatusState()

const alertToneByStatusTone: Record<DataSettingsStatusTone, AlertTone> = {
  success: 'success',
  error: 'danger',
  neutral: 'info',
}
const statusAlertTone = computed(() => alertToneByStatusTone[statusTone.value])
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-4']">
    <Alert v-if="statusMessage" :tone="statusAlertTone" live="polite">
      {{ statusMessage }}
    </Alert>
    <ChatsSection @status="handleStatus" />
    <DownloadedModelsSection @status="handleStatus" />
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
