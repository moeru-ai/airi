<script setup lang="ts">
import { Button } from '@proj-airi/stage-ui/components'
import { useFactorioStore } from '@proj-airi/stage-ui/stores/modules/gaming-factorio'
import { FieldCheckbox, FieldInput } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const factorioStore = useFactorioStore()
const { enabled, serverAddress, serverPort, username, configured } = storeToRefs(factorioStore)

// Create computed property to handle number to string conversion for the input field
const serverPortString = computed({
  get: () => serverPort.value?.toString() || '',
  set: (value) => {
    const numValue = Number.parseInt(value, 10)
    if (!Number.isNaN(numValue)) {
      serverPort.value = numValue
    }
  },
})

function saveSettings() {
  factorioStore.saveSettings()
}
</script>

<template>
  <div flex="~ col gap-6">
    <FieldCheckbox
      v-model="enabled"
      :label="t('settings.pages.modules.gaming-factorio.enable')"
      :description="t('settings.pages.modules.gaming-factorio.enable-description')"
    />

    <FieldInput
      v-model="serverAddress"
      :label="t('settings.pages.modules.gaming-factorio.server-address')"
      :description="t('settings.pages.modules.gaming-factorio.server-address-description')"
      :placeholder="t('settings.pages.modules.gaming-factorio.server-address-placeholder')"
    />

    <FieldInput
      v-model="serverPortString"
      type="number"
      :min="1"
      :max="65535"
      :step="1"
      :label="t('settings.pages.modules.gaming-factorio.server-port')"
      :description="t('settings.pages.modules.gaming-factorio.server-port-description')"
    />

    <FieldInput
      v-model="username"
      :label="t('settings.pages.modules.gaming-factorio.username')"
      :description="t('settings.pages.modules.gaming-factorio.username-description')"
      :placeholder="t('settings.pages.modules.gaming-factorio.username-placeholder')"
    />

    <div>
      <Button
        :label="t('settings.common.save')"
        variant="primary"
        @click="saveSettings"
      />
    </div>

    <div v-if="configured" class="mt-4 rounded-lg bg-green-100 p-4 text-green-800">
      {{ t('settings.pages.modules.gaming-factorio.configured') }}
    </div>
  </div>
</template>
