<script setup lang="ts">
import type { VoiceInfo } from '@proj-airi/stage-ui/stores/providers/provider'
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useAiriCardStore } from '@proj-airi/stage-ui/stores/modules/airi-card'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { FieldCombobox } from '@proj-airi/ui'
import { watchDebounced } from '@vueuse/core'
import { cloneDeep } from 'es-toolkit'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const providerId = 'minimax-speech'
const defaultModel = 'speech-2.8-hd'

// MiniMax takes synthesis parameters in its own `voice_setting` envelope. The
// provider definition maps speed/volume/pitch itself, so the page adds nothing.
const defaultVoiceSettings = {}

const speechStore = useSpeechStore()
const airiCardStore = useAiriCardStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()
const { configs: providers } = storeToRefs(providerStore)

const apiKeyConfigured = computed(() => !!providers.value[providerId]?.apiKey)

// The page offers both models the provider lists, and keeps the choice in the
// provider config so the Speech module can read it.
const model = computed({
  get: () => providers.value[providerId]?.model as string | undefined || defaultModel,
  set: (value: string) => {
    if (!providers.value[providerId])
      return
    providers.value[providerId].model = value
  },
})

const modelOptions = [
  { value: 'speech-2.8-hd', label: 'Speech 2.8 HD' },
  { value: 'speech-2.8-turbo', label: 'Speech 2.8 Turbo' },
]

// The picked voice lives in the provider config next to the model, and the
// playground binds to it. That binding is what makes a choice survive
// reopening the page, which a preview-local selection cannot do.
const voice = computed({
  get: () => providers.value[providerId]?.voice as string | undefined || '',
  set: (value: string) => {
    if (!providers.value[providerId])
      return
    providers.value[providerId].voice = value
  },
})

// A stable empty list keeps the computed value stable when the provider has no
// voice catalog yet. A new array on each read causes extra UI updates.
const emptyVoices: VoiceInfo[] = []
Object.freeze(emptyVoices)

const availableVoices = computed(() => {
  return speechStore.availableVoices[providerId] ?? emptyVoices
})

async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string>
  if (!provider) {
    throw new Error(t('settings.pages.providers.provider.minimax-speech.errors.provider-initialization-failed'))
  }

  const providerConfig = providerStore.getProviderConfig(providerId)

  return await speechStore.speech(
    provider,
    model.value,
    input,
    voiceId,
    {
      ...providerConfig,
      ...defaultVoiceSettings,
    },
  )
}

/** Saves the provider voice, then updates the character only when it uses this provider. */
async function selectVoice(value: string) {
  voice.value = value
  if (!airiCardStore.activeCard || !airiCardStore.moduleDefaults)
    return
  if (airiCardStore.getModules(airiCardStore.activeCardId).speech.provider !== providerId)
    return

  await airiCardStore.updateActiveCardSpeech({ voice_id: value })
}

async function loadVoicesWhenConfigured() {
  const providerConfig = providerStore.getProviderConfig(providerId)
  // Clone nested reactive values before the synchronized action sends its arguments.
  const configSnapshot = cloneDeep(providerConfig)
  if ((await providersStore.validateProviderConfig(providerId, configSnapshot)).valid) {
    await speechStore.loadVoicesForProvider(providerId)
  }
  else {
    console.error('Failed to validate provider config', providerConfig)
  }
}

// The page must load the catalog on mount. A saved key does not change after a
// reload, so a watcher without `immediate` never asks for the voices and the
// selector stays empty.
watchDebounced([
  () => providers.value[providerId]?.apiKey,
  () => providers.value[providerId]?.baseUrl,
], loadVoicesWhenConfigured, {
  debounce: 500,
  immediate: true,
})
</script>

<template>
  <SpeechProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
    :additional-settings="defaultVoiceSettings"
  >
    <template #basic-settings>
      <FieldCombobox
        v-model="model"
        :options="modelOptions"
        :label="t('settings.pages.providers.provider.minimax-speech.fields.field.model.label')"
        :description="t('settings.pages.providers.provider.minimax-speech.fields.field.model.description')"
        :placeholder="t('settings.pages.providers.provider.minimax-speech.fields.field.model.placeholder')"
        layout="horizontal"
      />
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :voice="voice"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :default-text="t('settings.pages.providers.provider.minimax-speech.playground.default-text')"
        @update:voice="selectVoice"
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
