<script setup lang="ts">
import type { RemovableRef } from '@vueuse/shared'

import {
  ProviderBaseUrlInput,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const { t } = useI18n()
const router = useRouter()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

// Get provider metadata
const providerId = 'player2'
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const baseUrl = computed({
  get: () => providers.value[providerId]?.baseUrl || '',
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}

    providers.value[providerId].baseUrl = value
  },
})
const hasPlayer2 = ref(true)

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  baseUrl.value = providers.value[providerId]?.baseUrl || ''

  try {
    const res = await fetch(`${baseUrl.value}health`, {
      method: 'GET',
      headers: {
        'player2-game-key': 'airi',
      },
    })
    hasPlayer2.value = res.status === 200
  }
  catch (e) {
    console.error(e)
    hasPlayer2.value = false
  }
})

// Watch settings and update the provider configuration
watch([baseUrl], () => {
  providers.value[providerId] = {
    ...providers.value[providerId],
    baseUrl: baseUrl.value || '',
  }
})

function handleResetSettings() {
  providers.value[providerId] = {
    ...(providerMetadata.value?.defaultOptions as any),
  }
}
</script>

<template>
  <div v-if="!hasPlayer2" style="color: red; margin-bottom: 1rem;">
    <div>
      Please download and run the Player2 App:
      <a href="https://player2.game" target="_blank" rel="noopener noreferrer">
        https://player2.game
      </a>

      <div>
        After downloading, if you still are having trouble, please reach out to us on Discord:
        <a href="https://player2.game/discord" target="_blank" rel="noopener noreferrer">
          https://player2.game/discord
        </a>.
      </div>
    </div>
  </div>

  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName"
    :provider-icon="providerMetadata?.icon"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer>
      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <ProviderBaseUrlInput v-model="baseUrl" placeholder="http://localhost:4315/v1/" />
      </ProviderBasicSettings>
    </ProviderSettingsContainer>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
