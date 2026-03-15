<script setup lang="ts">
import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
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
  <div flex="~ col gap-6">
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
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.messaging-discord.configured') }}
    </div>
  </div>
</template>
