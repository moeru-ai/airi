<script setup lang="ts">
import type { ChatSessionsExport } from '@proj-airi/stage-ui/types/chat-session'

import ChatsSection from '@proj-airi/stage-pages/pages/settings/data/components/chats-section.vue'
import DangerSection from '@proj-airi/stage-pages/pages/settings/data/components/danger-section.vue'
import ModelsModulesSection from '@proj-airi/stage-pages/pages/settings/data/components/models-modules-section.vue'
import StatusBanner from '@proj-airi/stage-pages/pages/settings/data/components/status-banner.vue'

import { createDataSettingsStatusState } from '@proj-airi/stage-pages/pages/settings/data/status'

import DesktopFolderSection from './components/desktop-folder-section.vue'
import DesktopResetSection from './components/desktop-reset-section.vue'

import { useChatSyncStore } from '../../../stores/chat-sync'

const { statusMessage, statusTone, handleStatus } = createDataSettingsStatusState()
const chatSync = useChatSyncStore()

async function syncImportedChats(payload: ChatSessionsExport) {
  await chatSync.requestImportSessions(payload)
}
</script>

<template>
  <div :class="['flex flex-col gap-4 pb-4']">
    <StatusBanner v-if="statusMessage" :message="statusMessage" :tone="statusTone" />
    <DesktopFolderSection @status="handleStatus" />
    <ChatsSection :sync-imported-chats="syncImportedChats" @status="handleStatus" />
    <ModelsModulesSection @status="handleStatus" />
    <DesktopResetSection @status="handleStatus" />
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
