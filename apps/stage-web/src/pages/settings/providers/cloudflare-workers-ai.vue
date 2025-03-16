<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  ProviderAccountIdInput,
  ProviderApiKeyInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores'
import { storeToRefs } from 'pinia'
import { computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'

const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'cloudflare-workers-ai'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

// Use computed properties for settings
const apiKey = computed({
  get: () => providers.value[providerId]?.apiKey || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].apiKey = value
  },
})

const accountId = computed({
  get: () => providers.value[providerId]?.accountId || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].accountId = value
  },
})

onMounted(() => {
  // Initialize provider if it doesn't exist
  providersStore.initializeProvider(providerId)

  // Initialize refs with current values
  apiKey.value = providers.value[providerId]?.apiKey || ''
  accountId.value = providers.value[providerId]?.accountId || ''
})

// Watch settings and update the provider configuration
watch([apiKey, accountId], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    apiKey: apiKey.value,
    accountId: accountId.value,
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions as any),
  }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        title="Basic"
        description="Essential settings"
        :on-reset="handleResetSettings"
      >
        <ProviderApiKeyInput
          v-model="apiKey"
          :provider-name="providerMetadata?.localizedName"
          placeholder="Your Cloudflare API token"
        />

        <ProviderAccountIdInput
          v-model="accountId"
          label="Account ID"
          description="Cloudflare Account ID"
          placeholder="Your Cloudflare Account ID"
        />
      </ProviderBasicSettings>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>
