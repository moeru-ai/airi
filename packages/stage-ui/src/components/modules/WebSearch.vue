<script setup lang="ts">
import { Callout, FieldCheckbox, FieldInput, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useWebSearchStore } from '../../stores/modules/web-search'

const { t } = useI18n()
const webSearchStore = useWebSearchStore()
// Settings persist to localStorage on change (useLocalStorageManualReset), and
// the tool + prompt react to `configured` — so there is no explicit save step.
const { enabled, apiKey, configured } = storeToRefs(webSearchStore)
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.web-search.enable')"
      :description="t('settings.pages.modules.web-search.enable-description')"
    />

    <FieldInput
      v-model="apiKey"
      type="password"
      :label="t('settings.pages.modules.web-search.api-key')"
      :description="t('settings.pages.modules.web-search.api-key-description')"
      :placeholder="t('settings.pages.modules.web-search.api-key-placeholder')"
    />

    <Callout
      v-if="configured"
      theme="lime"
      :label="t('settings.pages.modules.web-search.configured')"
    />
  </SettingsCard>
</template>
