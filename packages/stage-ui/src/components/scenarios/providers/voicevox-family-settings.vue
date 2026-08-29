<script setup lang="ts">
import type { SpeechProvider } from '@xsai-ext/providers/utils'

import { isStageTamagotchi } from '@proj-airi/stage-shared'
import { Callout, FieldRange } from '@proj-airi/ui'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import Alert from '../../misc/alert.vue'
import SpeechPlayground from './speech-playground.vue'
import SpeechProviderSettings from './speech-provider-settings.vue'

import { useProviderValidation } from '../../../composables/use-provider-validation'
import { useSpeechStore } from '../../../stores/modules/speech'
import { useProviderConfigStore } from '../../../stores/providers/config'
import { useProviderStore } from '../../../stores/providers/provider'

const props = defineProps<{
  providerId: string
  /** Translation key for the `intonationScale` label. Each engine reads that field differently. */
  intonationLabelKey: string
  intonationDescriptionKey: string
  defaultText: string
}>()

const { t } = useI18n()
const speechStore = useSpeechStore()
const providersStore = useProviderStore()
const providerStore = useProviderConfigStore()

// The engines take no credentials. The provider needs only the engine address,
// which lives under Advanced settings.
const apiKeyConfigured = true

// Only the browser surface negotiates the CORS policy of the engine. The
// desktop application forwards its requests through the Electron main process,
// which that policy does not restrict.
const showOriginCallout = computed(() => !isStageTamagotchi())

const availableVoices = computed(() => speechStore.availableVoices[props.providerId] || [])

// This call is the only code that marks the provider `configured`. Every
// voice-loading path reads that status.
//
// No other code validates these providers. An engine takes no API key, so the
// stored configuration always equals the schema defaults. `shouldListProvider`
// then keeps the provider out of the store validation sweep.
const { forceValid, isValid, isValidating, validationMessage } = useProviderValidation(props.providerId)

// SpeechProviderSettings loads the catalogue on mount, but only for a
// `configured` provider. The validation above resolves after that mount, so
// this watcher is what fills the list.
watch(() => providerStore.configuredProviders[props.providerId], async (configured) => {
  if (configured)
    await speechStore.loadVoicesForProvider(props.providerId)
})

async function handleGenerateSpeech(input: string, voiceId: string) {
  const provider = await providersStore.getProviderInstance(props.providerId) as SpeechProvider
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  return await speechStore.speech(
    provider,
    'default',
    input,
    voiceId,
    { ...providerStore.getProviderConfig(props.providerId) },
  )
}
</script>

<template>
  <Callout
    v-if="showOriginCallout"
    theme="violet"
    :label="t(`settings.pages.providers.provider.${props.providerId}.callout_origin_title`)"
  >
    {{ t(`settings.pages.providers.provider.${props.providerId}.callout_origin`) }}
  </Callout>

  <SpeechProviderSettings :provider-id="props.providerId" default-model="default" hide-api-key>
    <!-- The Advanced section starts collapsed. An unreachable engine leaves the
         voice list empty, so its reason has to stay visible. -->
    <template #basic-settings>
      <Alert v-if="isValidating > 0" type="loading">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationRunning') }}
        </template>
      </Alert>
      <Alert v-else-if="!isValid && validationMessage" type="error">
        <template #title>
          <div class="w-full flex items-center justify-between">
            <span>{{ t('settings.dialogs.onboarding.validationFailed') }}</span>
            <button
              type="button"
              class="ml-2 rounded bg-red-100 px-2 py-0.5 text-xs text-red-600 font-medium transition-colors dark:bg-red-800/30 hover:bg-red-200 dark:text-red-300 dark:hover:bg-red-700/40"
              @click="forceValid"
            >
              {{ t('settings.pages.providers.common.continueAnyway') }}
            </button>
          </div>
        </template>
        <template #content>
          <div class="whitespace-pre-wrap break-all">
            {{ validationMessage }}
          </div>
        </template>
      </Alert>
      <Alert v-else-if="isValid" type="success">
        <template #title>
          {{ t('settings.dialogs.onboarding.validationSuccess') }}
        </template>
      </Alert>
    </template>

    <template #voice-settings="{ voiceSettings }">
      <div class="flex flex-col gap-4">
        <FieldRange
          v-model="voiceSettings.speed"
          :label="t('settings.pages.providers.provider.common.fields.field.speed.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.speed.description')"
          :min="0.5" :max="2" :step="0.01"
        />

        <!-- The engine reads pitchScale in a narrow band around zero. The cloud
             providers take a percentage instead. -->
        <FieldRange
          v-model="voiceSettings.pitch"
          :label="t('settings.pages.providers.provider.common.fields.field.pitch.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.pitch.description')"
          :min="-0.15" :max="0.15" :step="0.01"
        />

        <FieldRange
          v-model="voiceSettings.intonation"
          :label="t(props.intonationLabelKey)"
          :description="t(props.intonationDescriptionKey)"
          :min="0" :max="2" :step="0.01"
        />

        <FieldRange
          v-model="voiceSettings.volume"
          :label="t('settings.pages.providers.provider.common.fields.field.volume.label')"
          :description="t('settings.pages.providers.provider.common.fields.field.volume.description')"
          :min="0" :max="2" :step="0.01"
        />
      </div>
    </template>

    <template #playground>
      <SpeechPlayground
        :available-voices="availableVoices"
        :generate-speech="handleGenerateSpeech"
        :api-key-configured="apiKeyConfigured"
        :use-ssml="false"
        :default-text="props.defaultText"
      />
    </template>
  </SpeechProviderSettings>
</template>
