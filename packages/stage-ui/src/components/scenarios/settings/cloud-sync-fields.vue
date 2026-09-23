<script setup lang="ts">
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useSettingsCloudSync } from '../../../stores/settings/cloud-sync'

const { t } = useI18n()
const { providerListSyncEnabled, chatMessagesSyncEnabled } = storeToRefs(useSettingsCloudSync())
</script>

<template>
  <div :class="['flex flex-col gap-3 text-left']">
    <div :class="['text-sm font-medium', 'text-neutral-800 dark:text-neutral-100']">
      {{ t('settings.cloud-sync.title') }}
    </div>
    <FieldCheckbox
      v-model="providerListSyncEnabled"
      :label="t('settings.cloud-sync.providers.title')"
    />
    <FieldCheckbox
      v-model="chatMessagesSyncEnabled"
      :label="t('settings.cloud-sync.chats.title')"
    />
  </div>
</template>
