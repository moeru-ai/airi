import type { AiriExtension } from '@proj-airi/stage-ui/stores/modules/airi-card'
import type { InferOutput } from 'valibot'

import { SHERPAW_TRANSCRIPTION_PROVIDER_ID } from '@proj-airi/provider-inference'
import { useHearingStore } from '@proj-airi/stage-ui/stores/modules/hearing'
import { useProviderConfigStore } from '@proj-airi/stage-ui/stores/providers/config'
import { useProviderStore } from '@proj-airi/stage-ui/stores/providers/provider'
import { boolean, object, parse, string } from 'valibot'

import localModeJson from './local-mode.json'

const OLLAMA_PROVIDER_ID = 'ollama'
const KOKORO_PROVIDER_ID = 'kokoro-local'

const localModeSchema = object({
  enabled: boolean(),
  ollama: object({
    baseUrl: string(),
    model: string(),
  }),
  speech: object({
    voice: string(),
  }),
  hearing: object({
    enabled: boolean(),
  }),
})

/** The settings in `local-mode.json`. Parsing fails the build-time import early if a field is missing. */
export type LocalModeConfig = InferOutput<typeof localModeSchema>

export const localModeConfig: LocalModeConfig = parse(localModeSchema, localModeJson)

type CardModules = Pick<AiriExtension['modules'], 'consciousness' | 'speech'>

/**
 * Configures Ollama, Kokoro, and Sherpaw, and returns the card module choices
 * that select Ollama and Kokoro.
 *
 * The caller must own synchronized Pinia leadership, because this changes
 * provider and hearing state that other windows replicate.
 *
 * Provider entries are marked configured without a connection check, so the
 * app does not need Ollama to be running at start. Hearing changes only when
 * no transcription provider is selected, so a choice made in Settings stays.
 *
 * Returns `undefined` when local mode is off. The card then inherits the
 * module choices from Settings.
 */
export async function applyLocalMode(config: LocalModeConfig): Promise<CardModules | undefined> {
  if (!config.enabled)
    return undefined

  const providerStore = useProviderStore()
  const providerConfigStore = useProviderConfigStore()

  const providerIds = [OLLAMA_PROVIDER_ID, KOKORO_PROVIDER_ID]
  if (config.hearing.enabled)
    providerIds.push(SHERPAW_TRANSCRIPTION_PROVIDER_ID)

  for (const providerId of providerIds)
    await providerStore.initializeProvider(providerId)

  await providerConfigStore.patchProviderConfig(OLLAMA_PROVIDER_ID, {
    baseUrl: config.ollama.baseUrl,
    model: config.ollama.model,
  })

  for (const providerId of providerIds)
    await providerStore.forceProviderConfigured(providerId)

  if (config.hearing.enabled) {
    const hearingStore = useHearingStore()
    if (!hearingStore.activeTranscriptionProvider) {
      // Sherpaw picks its default model from the interface language when the
      // provider is created. Reuse that choice for the hearing module.
      const sherpawModel = providerConfigStore.getProviderConfig(SHERPAW_TRANSCRIPTION_PROVIDER_ID)?.model
      hearingStore.activeCustomModelName = ''
      hearingStore.activeTranscriptionProvider = SHERPAW_TRANSCRIPTION_PROVIDER_ID
      hearingStore.activeTranscriptionModel = typeof sherpawModel === 'string' ? sherpawModel : ''
    }
  }

  // Kokoro picks a WebGPU or WASM model for this computer when the provider
  // is created. The card keeps that model, so a computer without WebGPU still works.
  const kokoroModel = providerConfigStore.getProviderConfig(KOKORO_PROVIDER_ID)?.model

  return {
    consciousness: { provider: OLLAMA_PROVIDER_ID, model: config.ollama.model },
    speech: {
      provider: KOKORO_PROVIDER_ID,
      model: typeof kokoroModel === 'string' ? kokoroModel : '',
      voice_id: config.speech.voice,
    },
  }
}
