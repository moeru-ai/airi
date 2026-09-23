<script setup lang="ts">
import { FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useSettingsCloudSync } from '../../../stores/settings/cloud-sync'

withDefaults(defineProps<{
  /** Onboarding tells the user where the same switches live after setup. */
  showSettingsHint?: boolean
}>(), {
  showSettingsHint: false,
})

const { t } = useI18n()
const { providerListSyncEnabled, chatMessagesSyncEnabled } = storeToRefs(useSettingsCloudSync())
</script>

<template>
  <div :class="['flex flex-col gap-3 text-left']">
    <div>
      <div :class="['text-sm font-medium', 'text-neutral-800 dark:text-neutral-100']">
        {{ t('settings.cloud-sync.title') }}
      </div>
      <p :class="['mt-1 text-xs leading-relaxed', 'text-neutral-500 dark:text-neutral-400']">
        {{ t('settings.cloud-sync.description') }}
      </p>
      <p
        v-if="showSettingsHint"
        :class="['mt-1 text-xs leading-relaxed', 'text-neutral-500 dark:text-neutral-400']"
      >
        {{ t('settings.cloud-sync.settingsHint') }}
      </p>
    </div>
    <FieldCheckbox
      v-model="providerListSyncEnabled"
      :label="t('settings.cloud-sync.providers.title')"
      :description="t('settings.cloud-sync.providers.description')"
    />
    <FieldCheckbox
      v-model="chatMessagesSyncEnabled"
      :label="t('settings.cloud-sync.chats.title')"
      :description="t('settings.cloud-sync.chats.description')"
    />
  </div>
</template>
