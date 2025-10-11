<script setup lang="ts">
import { Button } from '@proj-airi/stage-ui/components'
import { useDiscordStore } from '@proj-airi/stage-ui/stores/modules/discord'
import { useTelegramStore } from '@proj-airi/stage-ui/stores/modules/telegram'
import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const discordStore = useDiscordStore()
const telegramStore = useTelegramStore()

const discord = storeToRefs(discordStore)
const telegram = storeToRefs(telegramStore)

function saveDiscordSettings() {
  discordStore.saveSettings()
}

function saveTelegramSettings() {
  telegramStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-8">
    <!-- Discord Section -->
    <div border="b-1 border-gray-200 dark:border-gray-700 pb-6">
      <h3 class="mb-4 flex items-center gap-2 text-lg text-gray-900 font-semibold dark:text-gray-100">
        <div class="i-simple-icons:discord text-xl text-[#5865F2]" />
        Discord
      </h3>

      <div flex="~ col gap-6">
        <FieldCheckbox
          v-model="discord.enabled"
          :label="t('settings.pages.modules.messaging-discord.enable')"
          :description="t('settings.pages.modules.messaging-discord.enable-description')"
        />

        <FieldInput
          v-model="discord.token"
          type="password"
          :label="t('settings.pages.modules.messaging-discord.token')"
          :description="t('settings.pages.modules.messaging-discord.token-description')"
          :placeholder="t('settings.pages.modules.messaging-discord.token-placeholder')"
        />

        <div>
          <Button
            :label="t('settings.common.save')"
            variant="primary"
            @click="saveDiscordSettings"
          />
        </div>

        <div v-if="discord.configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
          {{ t('settings.pages.modules.messaging-discord.configured') }}
        </div>
      </div>
    </div>

    <!-- Telegram Section -->
    <div>
      <h3 class="mb-4 flex items-center gap-2 text-lg text-gray-900 font-semibold dark:text-gray-100">
        <div class="i-simple-icons:telegram text-xl text-[#0088CC]" />
        Telegram
      </h3>

      <div flex="~ col gap-6">
        <FieldCheckbox
          v-model="telegram.enabled"
          :label="t('settings.pages.modules.messaging-telegram.enable')"
          :description="t('settings.pages.modules.messaging-telegram.enable-description')"
        />

        <FieldInput
          v-model="telegram.token"
          type="password"
          :label="t('settings.pages.modules.messaging-telegram.token')"
          :description="t('settings.pages.modules.messaging-telegram.token-description')"
          :placeholder="t('settings.pages.modules.messaging-telegram.token-placeholder')"
        />

        <div>
          <Button
            :label="t('settings.common.save')"
            variant="primary"
            @click="saveTelegramSettings"
          />
        </div>

        <div v-if="telegram.configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
          {{ t('settings.pages.modules.messaging-telegram.configured') }}
        </div>
      </div>
    </div>
  </div>
</template>
