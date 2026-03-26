import { isStageTamagotchi } from '@proj-airi/stage-shared'

import { listProviders } from '../libs/providers/providers'

export interface PluginHostProviderSummary {
  name: string
}

export function listProvidersForPluginHost(_options?: unknown): PluginHostProviderSummary[] {
  return listProviders().map(provider => ({ name: provider.name }))
}

export function shouldPublishPluginHostCapabilities() {
  return isStageTamagotchi()
}
