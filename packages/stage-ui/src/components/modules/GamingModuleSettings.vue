<script setup lang="ts">
import type { StoreGeneric } from 'pinia'

import { Button, FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { useI18n } from 'vue-i18n'

import { useNumberString } from '../../composables/use-number-string'

interface GamingModuleStore extends StoreGeneric {
  enabled: boolean
  serverAddress: string
  serverPort: number | null
  username: string
  configured: boolean
  saveSettings: () => void
}

interface Props {
  // The gaming store instance with the expected interface (enabled, serverAddress, serverPort, username, configured, saveSettings)
  store: GamingModuleStore
  // Prefix for i18n translation keys (e.g., 'settings.pages.modules.gaming-minecraft')
  i18nKeyPrefix: string
}

const props = defineProps<Props>()
const { t } = useI18n()

// Extract reactive references from the store
const { enabled, serverAddress, serverPort, username, configured } = storeToRefs(props.store)

// Create computed property to handle number to string conversion for the input field
const serverPortString = useNumberString(serverPort)

function saveSettings() {
  props.store.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t(`${i18nKeyPrefix}.enable`)"
      :description="t(`${i18nKeyPrefix}.enable-description`)"
    />

    <FieldInput
      v-model="serverAddress"
      :label="t(`${i18nKeyPrefix}.server-address`)"
      :description="t(`${i18nKeyPrefix}.server-address-description`)"
      :placeholder="t(`${i18nKeyPrefix}.server-address-placeholder`)"
    />

    <FieldInput
      v-model="serverPortString"
      type="number"
      :min="1"
      :max="65535"
      :step="1"
      :label="t(`${i18nKeyPrefix}.server-port`)"
      :description="t(`${i18nKeyPrefix}.server-port-description`)"
    />

    <FieldInput
      v-model="username"
      :label="t(`${i18nKeyPrefix}.username`)"
      :description="t(`${i18nKeyPrefix}.username-description`)"
      :placeholder="t(`${i18nKeyPrefix}.username-placeholder`)"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t(`${i18nKeyPrefix}.configured`) }}
    </div>
  </div>
</template>
