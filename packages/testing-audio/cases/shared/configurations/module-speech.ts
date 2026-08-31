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

type SpeechModuleResolver = (context: AudioInputPreflightContext) => SpeechModuleConfiguration | undefined | Promise<SpeechModuleConfiguration | undefined>

/** Configures the speech module with the TTS Provider selected by one case. */
export function configureModuleSpeech(resolve: SpeechModuleResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureProvider(context.runtime, configuration.provider)
    await configureActiveCardModules(context.runtime, {
      speech: {
        provider: configuration.provider.id,
        model: configuration.provider.model,
        voice_id: configuration.voice,
      },
    })
    await configureStorage(context.runtime, {
      'settings/speech/active-provider': configuration.provider.id,
      'settings/speech/active-model': configuration.provider.model,
      'settings/speech/voice': configuration.voice,
      'settings/speech/output-muted': String(configuration.muted ?? false),
    })
  }
}
