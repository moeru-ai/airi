import type { AudioInputPreflightCallback, AudioInputPreflightContext } from '../../../src/types'
import type { ProviderConfiguration } from './provider'

import { configureActiveCardModules } from './active-card'
import { configureProvider } from './provider'
import { configureStorage } from './storage'

export interface ConsciousnessModuleConfiguration {
  provider: ProviderConfiguration
}

type ConsciousnessModuleResolver = (context: AudioInputPreflightContext) => ConsciousnessModuleConfiguration | undefined | Promise<ConsciousnessModuleConfiguration | undefined>

/** Configures the consciousness module with the LLM Provider selected by one case. */
export function configureModuleConsciousness(resolve: ConsciousnessModuleResolver): AudioInputPreflightCallback {
  return async (context) => {
    const configuration = await resolve(context)
    if (!configuration)
      return

    await configureProvider(context.runtime, configuration.provider)
    await configureActiveCardModules(context.runtime, {
      consciousness: {
        provider: configuration.provider.id,
        model: configuration.provider.model,
      },
    })
    await configureStorage(context.runtime, {
      'settings/consciousness/active-provider': configuration.provider.id,
      'settings/consciousness/active-model': configuration.provider.model,
    })
  }
}
