<script setup lang="ts">
import type { TranscriptionProviderWithExtraOptions } from '@xsai-ext/providers/utils'

import {
  TranscriptionPlayground,
  TranscriptionProviderSettings,
} from '@proj-airi/stage-ui/components'
import { OFFICIAL_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/stage-ui/libs/providers'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'

const hearingStore = useHearingStore()
const providersStore = useProvidersStore()

const providerId = OFFICIAL_TRANSCRIPTION_PROVIDER_ID
const defaultModel = 'auto'

async function handleGenerateTranscription(file: File) {
  const provider = await providersStore.getProviderInstance<TranscriptionProviderWithExtraOptions<string, Record<string, unknown>>>(providerId)
  if (!provider)
    throw new Error('Failed to initialize official transcription provider')

  return await hearingStore.transcription(
    providerId,
    provider,
    defaultModel,
    file,
    'json',
  )
}
</script>

<template>
  <TranscriptionProviderSettings
    :provider-id="providerId"
    :default-model="defaultModel"
  >
    <template #playground>
      <TranscriptionPlayground
        :generate-transcription="handleGenerateTranscription"
        :api-key-configured="true"
      />
    </template>
  </TranscriptionProviderSettings>
</template>

<route lang="yaml">
  meta:
    layout: settings
    stageTransition:
      name: slide
</route>
