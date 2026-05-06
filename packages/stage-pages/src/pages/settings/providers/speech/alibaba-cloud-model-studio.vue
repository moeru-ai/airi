<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'
import type { UnElevenLabsOptions } from 'unspeech'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldInput, FieldRange, FieldSelect } from '@proj-airi/ui'
import { useDebounceFn } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'alibaba-cloud-model-studio'
const defaultModel = 'cosyvoice-v1'

// 可选模型列表
const modelOptions = [
  { value: 'cosyvoice-v1', label: 'CosyVoice v1' },
  { value: 'cosyvoice-v2', label: 'CosyVoice v2' },
  { value: 'cosyvoice-v3-flash', label: 'CosyVoice v3 Flash（支持复刻声音）' },
]

// Default voice settings specific to ElevenLabs
const defaultVoiceSettings = {
  speed: 1.0,
}

const pitch = ref<number>(0)
const speed = ref<number>(1.0)
const volume = ref<number>(0)

const speechStore = useSpeechStore()
const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore)
const { t } = useI18n()

// 模型选择
const selectedModel = ref<string>(defaultModel)

// 自定义声音 ID（用于阿里百炼复刻声音）
const customVoiceId = ref<string>('')

// 当用户修改自定义声音 ID 时，保存到 provider config 并刷新声音列表
const debouncedSaveCustomVoiceId = useDebounceFn(async () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}

  providers.value[providerId].customVoiceId = customVoiceId.value.trim()
  await speechStore.loadVoicesForProvider(providerId)
}, 800)

watch(customVoiceId, () => {
  debouncedSaveCustomVoiceId()
})

// Check if API key is configured
const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// Get available voices
const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] || []
})

// Generate speech
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  if (!provider) {
    throw new Error('Failed to initialize speech provider')
  }

  // Get provider configuration
  const providerConfig = providersStore.getProviderConfig(providerId)

  // 使用用户选择的模型
  const model = selectedModel.value || defaultModel

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
    },
  )
}

// 当用户修改模型时，保存到 provider config
watch(selectedModel, () => {
  if (!providers.value[providerId])
    providers.value[providerId] = {}

  providers.value[providerId].model = selectedModel.value
})

onMounted(async () => {
  // 初始化时从 provider config 读取已保存的模型和自定义声音 ID
  const providerConfig = providersStore.getProviderConfig(providerId)
  selectedModel.value = (providerConfig.model as string) || defaultModel
  customVoiceId.value = (providerConfig.customVoiceId as string) || ''

  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
})

watch(pitch, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.pitch = pitch.value
})

watch(speed, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.speed = speed.value
})

watch(volume, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  providerConfig.volume = volume.value
})

watch(providers, async () => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  const providerMetadata = providersStore.getProviderMetadata(providerId)
  if (await providerMetadata.validators.validateProviderConfig(providerConfig)) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}, {
  immediate: true,
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <!-- Voice settings -->
    <template #voice-settings>
      <div flex="~ col gap-4">
        <!-- 模型选择 -->
        <FieldSelect
          v-model="selectedModel"
          :options="modelOptions"
          label="模型"
          description="选择语音合成模型。使用复刻声音时，必须选择与创建声音时相同的模型。"
          layout="horizontal"
        />

        <!-- 自定义声音 ID 输入框（用于阿里百炼复刻声音） -->
        <FieldInput
          v-model="customVoiceId"
          label="自定义声音 ID"
          description="填入阿里百炼复刻声音的 voice ID，例如 cosyvoice-v3-flash-bailian-xxxx。填入后会自动出现在声音选择列表中。"
          placeholder="cosyvoice-v3-flash-bailian-..."
        />

        <!-- Pitch control - common to most providers -->
        <FieldRange
          v-model="pitch"
          :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
          :min="-100"
          :max="100" :step="1" :format-value="value => `${value}%`"
        />

        <!-- Speed control - common to most providers -->
        <FieldRange
          v-model="speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5"
          :max="2.0" :step="0.01"
        />

        <!-- Volume control - available in some providers -->
        <FieldRange
          v-model="volume"
          :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
          :min="-100"
          :max="100" :step="1" :format-value="value => `${value}%`"
        />
      </div>
    </template>

    <!-- Replace the default playground with our standalone component -->
    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        default-text="你好！这是阿里百炼语音合成的测试。"
      />
    </template>
  </SpeechProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
  </route>
