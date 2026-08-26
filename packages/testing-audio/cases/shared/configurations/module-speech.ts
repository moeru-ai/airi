import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'
import type { ProviderConfiguration } from './provider'

import { configureActiveCardModules } from './active-card'
import { configureProvider } from './provider'
import { configureStorage } from './storage'

export interface SpeechModuleConfiguration {
  /** @default false */
  muted?: boolean
  provider: ProviderConfiguration
  voice: string
}

type SpeechModuleResolver = (context: AudioInputPreflightContext) => Promise<SpeechModuleConfiguration | undefined> | SpeechModuleConfiguration | undefined

/** Configures the speech module with the TTS Provider selected by one case. */
export function configureModuleSpeech(resolve: SpeechModuleResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureProvider(context.runtime, configuration.provider)
    await configureActiveCardModules(context.runtime, {
      speech: {
        model: configuration.provider.model,
        provider: configuration.provider.id,
        voice_id: configuration.voice,
      },
    })
    await configureStorage(context.runtime, {
      'settings/speech/active-model': configuration.provider.model,
      'settings/speech/active-provider': configuration.provider.id,
      'settings/speech/output-muted': String(configuration.muted ?? false),
      'settings/speech/voice': configuration.voice,
    })
  }
}
