<script setup lang="ts">
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useTwitterStore } from '../../stores/modules/twitter'

const { t } = useI18n()
const twitterStore = useTwitterStore()
const { enabled, apiKey, apiSecret, accessToken, accessTokenSecret, configured } = storeToRefs(twitterStore)

function saveSettings() {
  twitterStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.x.enable')"
      :description="t('settings.pages.modules.x.enable-description')"
    />

    <FieldInput
      v-model="apiKey"
      type="password"
      :label="t('settings.pages.modules.x.api-key')"
      :description="t('settings.pages.modules.x.api-key-description')"
      :placeholder="t('settings.pages.modules.x.api-key-placeholder')"
    />

    <FieldInput
      v-model="apiSecret"
      type="password"
      :label="t('settings.pages.modules.x.api-secret')"
      :description="t('settings.pages.modules.x.api-secret-description')"
      :placeholder="t('settings.pages.modules.x.api-secret-placeholder')"
    />

    <FieldInput
      v-model="accessToken"
      type="password"
      :label="t('settings.pages.modules.x.access-token')"
      :description="t('settings.pages.modules.x.access-token-description')"
      :placeholder="t('settings.pages.modules.x.access-token-placeholder')"
    />

    <FieldInput
      v-model="accessTokenSecret"
      type="password"
      :label="t('settings.pages.modules.x.access-token-secret')"
      :description="t('settings.pages.modules.x.access-token-secret-description')"
      :placeholder="t('settings.pages.modules.x.access-token-secret-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.x.configured') }}
    </div>
  </div>
</template>
