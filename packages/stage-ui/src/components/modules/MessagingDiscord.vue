<script setup lang="ts">
import { Alert, Button, FieldCheckbox, FieldInput, SettingsCard } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useDiscordStore } from '../../stores/modules/discord'

const { t } = useI18n()
const discordStore = useDiscordStore()
const { enabled, token, configured } = storeToRefs(discordStore)

function saveSettings() {
  discordStore.saveSettings()
}
</script>

<template>
  <SettingsCard>
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.messaging-discord.enable')"
      :description="t('settings.pages.modules.messaging-discord.enable-description')"
    />

    <FieldInput
      v-model="token"
      type="password"
      :label="t('settings.pages.modules.messaging-discord.token')"
      :description="t('settings.pages.modules.messaging-discord.token-description')"
      :placeholder="t('settings.pages.modules.messaging-discord.token-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"

        @click="saveSettings"
      />
    </div>

    <Alert v-if="configured" tone="success" :class="['mt-4']">
      {{ t('settings.pages.modules.messaging-discord.configured') }}
    </Alert>
  </SettingsCard>
</template>
