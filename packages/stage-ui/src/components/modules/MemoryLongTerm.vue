<script setup lang="ts">
import { Button, FieldCheckbox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import { useMemoryLongTermStore } from '../../stores/modules/memory-long-term'

const { t } = useI18n()
const memoryStore = useMemoryLongTermStore()
const { enabled, autoRecall, autoCapture, configured, tenantId, status, lastError } = storeToRefs(memoryStore)
const saving = ref(false)
const reconnecting = ref(false)

const statusLabel = computed(() => {
  if (!enabled.value)
    return t('settings.pages.modules.memory-long-term.status-disabled')
  if (status.value === 'provisioning')
    return t('settings.pages.modules.memory-long-term.status-provisioning')
  if (status.value === 'error')
    return t('settings.pages.modules.memory-long-term.status-error')
  if (configured.value)
    return t('settings.pages.modules.memory-long-term.status-ready')
  return t('settings.pages.modules.memory-long-term.status-idle')
})

async function saveSettings() {
  saving.value = true
  try {
    await memoryStore.saveSettings()
  }
  finally {
    saving.value = false
  }
}

async function reconnect() {
  reconnecting.value = true
  try {
    await memoryStore.reProvisionTenant()
  }
  finally {
    reconnecting.value = false
  }
}
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <div :class="['rounded-2xl border border-primary-200/40 bg-primary-50/60 p-4 dark:border-primary-700/40 dark:bg-primary-950/20']">
      <div :class="['text-sm font-medium text-primary-800 dark:text-primary-100']">
        {{ t('settings.pages.modules.memory-long-term.status-title') }}
      </div>
      <div :class="['mt-2 text-lg font-semibold text-primary-900 dark:text-primary-50']">
        {{ statusLabel }}
      </div>
      <div
        v-if="tenantId"
        :class="['mt-2 break-all font-mono text-xs text-primary-700/80 dark:text-primary-200/80']"
      >
        {{ tenantId }}
      </div>
      <div
        v-if="lastError"
        :class="['mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-200']"
      >
        {{ lastError }}
      </div>
    </div>

    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.memory-long-term.enable')"
      :description="t('settings.pages.modules.memory-long-term.enable-description')"
    />

    <FieldCheckbox
      v-model="autoRecall"
      :label="t('settings.pages.modules.memory-long-term.auto-recall')"
      :description="t('settings.pages.modules.memory-long-term.auto-recall-description')"
    />

    <FieldCheckbox
      v-model="autoCapture"
      :label="t('settings.pages.modules.memory-long-term.auto-capture')"
      :description="t('settings.pages.modules.memory-long-term.auto-capture-description')"
    />

    <div :class="['flex flex-wrap gap-3']">
      <Button
        :label="saving ? t('settings.pages.modules.memory-long-term.saving') : t('settings.common.save')"
        variant="primary"
        :disabled="saving || reconnecting"
        @click="saveSettings"
      />
      <Button
        :label="reconnecting ? t('settings.pages.modules.memory-long-term.reconnecting') : t('settings.pages.modules.memory-long-term.reconnect')"
        variant="secondary"
        :disabled="saving || reconnecting"
        @click="reconnect"
      />
    </div>
  </div>
</template>
