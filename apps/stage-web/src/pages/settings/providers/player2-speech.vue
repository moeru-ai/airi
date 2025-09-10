<script setup lang="ts">
import type { SpeechProviderWithExtraOptions } from '@xsai-ext/shared-providers'
import type { UnElevenLabsOptions } from 'unspeech'

import {
  Callout,
  SpeechPlayground,
  SpeechProviderSettings,
} from '@proj-airi/stage-ui/components'
import { useSpeechStore } from '@proj-airi/stage-ui/stores/modules/speech'
import { useProvidersStore } from '@proj-airi/stage-ui/stores/providers'
import { FieldRange } from '@proj-airi/ui'
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'

const providerId = 'player2-speech'
const defaultModel = 'v1'
const speedRatio = ref<number>(1.0)
const speechStore = useSpeechStore()
const providersStore = useProvidersStore()

const { t } = useI18n()

// Get available voices for Player2
const availableVoices = computed(() => speechStore.availableVoices[providerId] || [])

// API key configured state
const apiKeyConfigured = computed(() => {
  const providerConfig = providersStore.getProviderConfig(providerId)
  return !!providerConfig?.apiKey
})

// Generate speech with Player2-specific parameters
async function handleGenerateSpeech(input: string, voiceId: string, _useSSML: boolean) {
  const provider = await providersStore.getProviderInstance(providerId) as SpeechProviderWithExtraOptions<string, UnElevenLabsOptions>
  if (!provider)
    throw new Error('Failed to initialize speech provider')

  const providerConfig = providersStore.getProviderConfig(providerId)
  const model = typeof providerConfig.model === 'string'
    ? providerConfig.model
    : defaultModel

  return await speechStore.speech(
    provider,
    model,
    input,
    voiceId,
    {
      ...providerConfig,
    },
  )
}

const hasPlayer2 = ref(true)

onMounted(async () => {
  try {
    const providerConfig = providersStore.getProviderConfig(providerId)
    const providerMetadata = providersStore.getProviderMetadata(providerId)

    if (await providerMetadata?.validators?.validateProviderConfig?.(providerConfig)) {
      await speechStore.loadVoicesForProvider(providerId)
    }
    else {
      console.error('Failed to validate provider config', providerConfig)
    }

    const baseUrl = (providerConfig.baseUrl as string | undefined) ?? ''
    const url = `${baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl}/health`

    const res = await fetch(url, {
      method: 'GET',
      headers: { 'player2-game-key': 'airi' },
    })

    hasPlayer2.value = res.status === 200
  }
  catch (e) {
    console.error(e)
    hasPlayer2.value = false
  }
})

watch(speedRatio, (newSpeed) => {
  const provider = providersStore.providers[providerId]
  if (provider)
    provider.speed = newSpeed
})
</script>
