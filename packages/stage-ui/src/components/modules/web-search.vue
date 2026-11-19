<script setup lang="ts">
import { Alert, FieldCheckbox, FieldInput, FieldSelect, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useWebSearchStore } from '../../stores/modules/web-search'

const { t } = useI18n()
const webSearchStore = useWebSearchStore()
const { enabled, provider, activeApiKey, configured } = storeToRefs(webSearchStore)
const providers = [
  { label: 'Tavily', value: 'tavily' },
  { label: 'DeepSeek', value: 'deepseek' },
]
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.web-search.enable')"
      :description="t('settings.pages.modules.web-search.enable-description')"
    />

    <FieldSelect
      v-model="provider"
      :label="t('settings.pages.modules.web-search.provider')"
      :options="providers"
    />

    <FieldInput
      v-if="provider === 'deepseek'"
      v-model="activeApiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.deepseek.api-key')"
      :description="t('settings.pages.modules.web-search.deepseek.api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.deepseek.api-key-placeholder')"
    />
    <FieldInput
      v-else
      v-model="activeApiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.api-key')"
      :description="t('settings.pages.modules.web-search.api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.api-key-placeholder')"
    />

    <Alert
      v-if="configured"
      tone="success"
      :title="t('settings.pages.modules.web-search.configured')"
    />
  </SettingsCard>
</template>
