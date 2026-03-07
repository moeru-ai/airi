<script setup lang="ts">
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useMatrixStore } from '../../stores/modules/matrix'

const { t } = useI18n()
const matrixStore = useMatrixStore()
const { enabled, homeserverUrl, accessToken, userId, configured } = storeToRefs(matrixStore)

function saveSettings() {
  matrixStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.messaging-matrix.enable')"
      :description="t('settings.pages.modules.messaging-matrix.enable-description')"
    />

    <FieldInput
      v-model="homeserverUrl"
      :label="t('settings.pages.modules.messaging-matrix.homeserver-url')"
      :description="t('settings.pages.modules.messaging-matrix.homeserver-url-description')"
      :placeholder="t('settings.pages.modules.messaging-matrix.homeserver-url-placeholder')"
    />

    <FieldInput
      v-model="userId"
      :label="t('settings.pages.modules.messaging-matrix.user-id')"
      :description="t('settings.pages.modules.messaging-matrix.user-id-description')"
      :placeholder="t('settings.pages.modules.messaging-matrix.user-id-placeholder')"
    />

    <FieldInput
      v-model="accessToken"
      type="password"
      :label="t('settings.pages.modules.messaging-matrix.access-token')"
      :description="t('settings.pages.modules.messaging-matrix.access-token-description')"
      :placeholder="t('settings.pages.modules.messaging-matrix.access-token-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.messaging-matrix.configured') }}
    </div>
  </div>
</template>
