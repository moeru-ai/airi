<script setup lang="ts">
import {
  ProviderApiKeyInput,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
  SpeechPlayground,
} from '@proj-airi/stage-ui/components'
import { getVolcengineStreamingDefaultModel, streamingSynthesize, VOLCENGINE_STREAMING_PROVIDER_ID } from '@proj-airi/stage-ui/libs'
import { useAuthStore } from '@proj-airi/stage-ui/stores/auth'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { Button, Callout, ComboboxSelect } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const authStore = useAuthStore()
const providersStore = useProvidersStore()
const speechStore = useSpeechStore()
const { isAuthenticated, needsLogin } = storeToRefs(authStore)
const { providers } = storeToRefs(providersStore)

const providerId = VOLCENGINE_STREAMING_PROVIDER_ID
const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))
const providerConfig = computed(() => providersStore.getProviderConfig(providerId))

const apiKey = computed({
  get: () => (providers.value[providerId]?.apiKey as string | undefined) ?? '',
  set: (value: string) => {
    providers.value[providerId] ??= {}
    providers.value[providerId].apiKey = value
  },
})
const apiKeyConfigured = computed(() => apiKey.value.trim().length > 0)

const providerModels = computed(() => providersStore.getModelsForProvider(providerId))
const modelsLoading = computed(() => providersStore.isLoadingModels[providerId] || false)
const discoveredDefaultModel = ref<string | null>(null)
const model = computed({
  get: () => (providerConfig.value?.model as string | undefined) ?? discoveredDefaultModel.value ?? '',
  set: (value: string) => {
    providers.value[providerId] ??= {}
    providers.value[providerId].model = value
  },
})
const modelOptions = computed(() => providerModels.value.map(item => ({ label: item.name, value: item.id })))

const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])
const voicesLoading = ref(false)

async function loadVoices() {
  if (!isAuthenticated.value || !model.value)
    return
  voicesLoading.value = true
  try {
    await speechStore.loadVoicesForProvider(providerId, model.value)
  }
  finally {
    voicesLoading.value = false
  }
}

async function loadCatalog() {
  if (!isAuthenticated.value)
    return
  await providersStore.fetchModelsForProvider(providerId)
  discoveredDefaultModel.value = getVolcengineStreamingDefaultModel() ?? providerModels.value[0]?.id ?? null
  if (!providerConfig.value.model && discoveredDefaultModel.value)
    model.value = discoveredDefaultModel.value
  await loadVoices()
}

async function handleGenerateSpeech(input: string, voiceId: string): Promise<ArrayBuffer> {
  const requestedModel = model.value
  const key = apiKey.value.trim()
  if (!key)
    throw new Error('X-Api-Key is required.')
  if (!requestedModel.includes('/'))
    throw new Error(`Streaming model id missing backend prefix: ${requestedModel}`)

  const resourceId = requestedModel.split('/', 2)[1]
  const result = await streamingSynthesize({
    connection: {
      credentialMode: 'byok',
      providerId,
      apiKey: key,
    },
    model: requestedModel,
    voice: voiceId,
    input,
    ttsSource: 'manual_preview',
    ttsVoiceType: 'custom_configured',
    extraBody: {
      api_resource_id: resourceId,
      audio: { sample_rate: 24000, bit_rate: 64000 },
    },
  })
  return result.audio
}

function handleLogin() {
  needsLogin.value = true
}

onMounted(async () => {
  providersStore.initializeProvider(providerId)
  await loadCatalog()
})

watch(isAuthenticated, async (authenticated) => {
  if (authenticated)
    await loadCatalog()
})

watch(model, async () => {
  await loadVoices()
})
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata.localizedName"
    :provider-icon-color="providerMetadata.iconColor"
    :on-back="() => router.back()"
  >
    <div v-if="!isAuthenticated" :class="['mx-auto max-w-2xl', 'flex flex-col gap-4']">
      <Callout theme="primary" :label="providerMetadata.localizedName">
        <div :class="['flex flex-col gap-3']">
          <p>{{ t('settings.pages.providers.provider.volcengine-streaming.login-required') }}</p>
          <Button class="w-fit" @click="handleLogin">
            {{ t('settings.dialogs.onboarding.loginAction') }}
          </Button>
        </div>
      </Callout>
    </div>

    <div v-else :class="['flex flex-col gap-6 md:flex-row']">
      <ProviderSettingsContainer class="w-full md:w-[40%]">
        <ProviderBasicSettings
          :title="t('settings.pages.providers.common.section.basic.title')"
          :description="t('settings.pages.providers.provider.volcengine-streaming.config-description')"
        >
          <ProviderApiKeyInput
            v-model="apiKey"
            :provider-name="providerMetadata.localizedName"
            :label="t('settings.pages.providers.provider.volcengine-streaming.fields.api-key.label')"
            :description="t('settings.pages.providers.provider.volcengine-streaming.fields.api-key.description')"
            :placeholder="t('settings.pages.providers.provider.volcengine-streaming.fields.api-key.placeholder')"
            required
          />

          <ComboboxSelect
            v-model="model"
            :options="modelOptions"
            :disabled="modelsLoading"
            :placeholder="t('settings.pages.providers.provider.volcengine-streaming.model-placeholder')"
          />
        </ProviderBasicSettings>

        <Callout :label="t('settings.pages.providers.provider.volcengine-streaming.privacy-title')">
          <p>{{ t('settings.pages.providers.provider.volcengine-streaming.privacy-description') }}</p>
        </Callout>
      </ProviderSettingsContainer>

      <div class="w-full md:w-[60%]">
        <SpeechPlayground
          :available-voices="availableVoices"
          :generate-speech="handleGenerateSpeech"
          :api-key-configured="apiKeyConfigured"
          :voices-loading="voicesLoading"
          :default-text="t('settings.pages.providers.provider.volcengine-streaming.preview-text')"
        />
      </div>
    </div>
  </ProviderSettingsLayout>
</template>

<route lang="yaml">
meta:
  layout: settings
  stageTransition:
    name: slide
</route>
