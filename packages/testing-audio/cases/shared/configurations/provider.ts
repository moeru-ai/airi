import type { AudioInputSession } from '../../../src/types'

/** Provider values stored by one case preflight callback. */
export interface ProviderConfiguration {
  config: Record<string, unknown>
  definitionId: string
  id: string
  model: string
}

/** Adds one Provider without replacing Providers configured by earlier callbacks. */
export async function configureProvider(runtime: AudioInputSession, provider: ProviderConfiguration): Promise<void> {
  await runtime.page.evaluate(({ configuredProvider }) => {
    const credentials = JSON.parse(localStorage.getItem('settings/credentials/providers') ?? '{}') as Record<string, unknown>
    const configured = JSON.parse(localStorage.getItem('settings/providers/configured') ?? '{}') as Record<string, unknown>
    const added = JSON.parse(localStorage.getItem('settings/providers/added') ?? '{}') as Record<string, boolean>

    credentials[configuredProvider.id] = configuredProvider.config
    configured[configuredProvider.id] = {
      id: configuredProvider.id,
      definitionId: configuredProvider.definitionId,
      config: configuredProvider.config,
      status: 'configured',
    }
    added[configuredProvider.id] = true

    localStorage.setItem('settings/credentials/providers', JSON.stringify(credentials))
    localStorage.setItem('settings/providers/configured', JSON.stringify(configured))
    localStorage.setItem('settings/providers/added', JSON.stringify(added))
  }, { configuredProvider: provider })
}
