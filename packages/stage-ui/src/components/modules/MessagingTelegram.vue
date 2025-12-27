<script setup lang="ts">
import { Button } from '@proj-airi/stage-ui/components'
import { useTelegramStore } from '@proj-airi/stage-ui/stores/modules/telegram'
import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const telegramStore = useTelegramStore()
const { enabled, token, configured } = storeToRefs(telegramStore)

function saveSettings() {
  telegramStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.messaging-telegram.enable')"
      :description="t('settings.pages.modules.messaging-telegram.enable-description')"
    />

    <FieldInput
      v-model="token"
      type="password"
      :label="t('settings.pages.modules.messaging-telegram.token')"
      :description="t('settings.pages.modules.messaging-telegram.token-description')"
      :placeholder="t('settings.pages.modules.messaging-telegram.token-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.messaging-telegram.configured') }}
    </div>
  </div>
</template>
