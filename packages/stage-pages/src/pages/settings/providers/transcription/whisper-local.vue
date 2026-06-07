<script setup lang="ts">
import type { RemovableRef } from '@vueuse/core'

import {
  Alert,
  ProviderBasicSettings,
  ProviderSettingsContainer,
  ProviderSettingsLayout,
} from '@proj-airi/stage-ui/components'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldCombobox } from '@proj-airi/ui'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

const providerId = 'whisper-local'
const { t } = useI18n()
const router = useRouter()

const providersStore = useProvidersStore()
const { providers } = storeToRefs(providersStore) as { providers: RemovableRef<Record<string, any>> }

providersStore.initializeProvider(providerId)

const providerMetadata = computed(() => providersStore.getProviderMetadata(providerId))

const DEFAULT_LANGUAGE = 'en'

const language = computed({
  get: () => providers.value[providerId]?.language || DEFAULT_LANGUAGE,
  set: (value) => {
    if (!providers.value[providerId])
      providers.value[providerId] = {}
    providers.value[providerId].language = value
  },
})

// Whisper is multilingual and accepts ISO 639-1 language codes; a common subset
// is offered here.
const languageOptions = [
  { label: 'English', value: 'en' },
  { label: 'Spanish', value: 'es' },
  { label: 'French', value: 'fr' },
  { label: 'German', value: 'de' },
  { label: 'Italian', value: 'it' },
  { label: 'Portuguese', value: 'pt' },
  { label: 'Dutch', value: 'nl' },
  { label: 'Russian', value: 'ru' },
  { label: 'Japanese', value: 'ja' },
  { label: 'Korean', value: 'ko' },
  { label: 'Chinese', value: 'zh' },
  { label: 'Arabic', value: 'ar' },
  { label: 'Hindi', value: 'hi' },
  { label: 'Turkish', value: 'tr' },
]

function handleResetSettings() {
  // The active transcription model is chosen in the hearing settings dropdown
  // (and defaulted by the provider); this page only manages the language hint.
  providers.value[providerId] = { language: DEFAULT_LANGUAGE }
}
</script>

<template>
  <ProviderSettingsLayout
    :provider-name="providerMetadata?.localizedName || 'Whisper (Local)'"
    :provider-icon="providerMetadata?.icon"
    :provider-icon-color="providerMetadata?.iconColor"
    :on-back="() => router.back()"
  >
    <ProviderSettingsContainer class="w-full md:w-[60%] space-y-6">
      <Alert type="info">
        <template #title>
          Free, in-browser transcription
        </template>
        <template #content>
          Whisper runs entirely in your browser — no API key, and no audio leaves your device. The model
          (~800&nbsp;MB, Whisper Large V3 Turbo) downloads once on first use and is cached afterward. It uses
          WebGPU where available and falls back to WASM (CPU) otherwise.
        </template>
      </Alert>

      <ProviderBasicSettings
        :title="t('settings.pages.providers.common.section.basic.title')"
        :description="t('settings.pages.providers.common.section.basic.description')"
        :on-reset="handleResetSettings"
      >
        <div class="space-y-4">
          <FieldCombobox
            v-model="language"
            label="Recognition Language"
            description="Language hint passed to Whisper for transcription."
            :options="languageOptions"
            layout="vertical"
          />
        </div>
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
