import { describe, expect, it } from 'vitest'

import { resolveProviderDisplayName } from './display-name'

describe('resolveProviderDisplayName', () => {
  it('prefers a custom display name', () => {
    expect(resolveProviderDisplayName(
      { definitionId: 'openai-compatible', displayName: 'Production OpenAI' },
      { name: 'OpenAI Compatible' },
    )).toBe('Production OpenAI')
  })

  it('uses the provider definition name for an empty custom name', () => {
    expect(resolveProviderDisplayName(
      { definitionId: 'openai-compatible', displayName: '  ' },
      { name: 'OpenAI Compatible' },
    )).toBe('OpenAI Compatible')
  })

  it('uses the definition id when no provider definition exists', () => {
    expect(resolveProviderDisplayName({ definitionId: 'unknown-provider' })).toBe('unknown-provider')
  })
})
