import { describe, expect, it } from 'vitest'

import { resolveOnboardingProviders } from './onboarding-provider-catalog'

describe('resolveOnboardingProviders', () => {
  it('includes OpenCode Go in the first-time provider selection', () => {
    // ROOT CAUSE:
    //
    // The provider registry and the first-time selection used separate catalogs.
    // OpenCode Go was registered for settings, but its ID was absent from the
    // curated onboarding catalog. New users could not select it during setup.
    const providers = [
      { id: 'ollama' },
      { id: 'opencode-go' },
      { id: 'settings-only-provider' },
      { id: 'openai' },
    ]

    const result = resolveOnboardingProviders(providers)

    expect(result.map(provider => provider.id)).toEqual([
      'openai',
      'opencode-go',
      'ollama',
    ])
  })
})
