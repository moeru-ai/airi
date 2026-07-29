<script setup lang="ts">
import { Button, Callout, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTwitterStore } from '../../stores/modules/twitter'

const { t } = useI18n()
const twitterStore = useTwitterStore()
const { enabled, apiKey, apiSecret, accessToken, accessTokenSecret, configured } = storeToRefs(twitterStore)

const statusTheme = computed(() => configured.value ? 'lime' : 'orange')
const statusLabel = computed(() => {
  return configured.value
    ? t('settings.pages.modules.x.service-online')
    : t('settings.pages.modules.x.service-offline')
})

function saveSettings() {
  twitterStore.saveSettings()
}

onMounted(() => {
  twitterStore.initialize()
})
</script>

<template>
  <div :class="['flex flex-col gap-6']">
    <Callout :theme="statusTheme" :label="statusLabel" />

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
  </div>
</template>
