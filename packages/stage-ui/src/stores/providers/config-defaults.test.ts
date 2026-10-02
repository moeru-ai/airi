import { describe, expect, it } from 'vitest'

import { normalizeProviderConfigDefaults } from './config-defaults'

describe('normalizeProviderConfigDefaults', () => {
  it('treats omitted schema defaults as unchanged provider config', () => {
    expect(normalizeProviderConfigDefaults(
      { baseUrl: 'https://api.deepseek.com/' },
      { baseUrl: 'https://api.deepseek.com/', thinkingMode: 'auto' },
    )).toEqual({
      baseUrl: 'https://api.deepseek.com/',
      thinkingMode: 'auto',
    })
  })

  it('keeps explicit non-default values dirty', () => {
    expect(normalizeProviderConfigDefaults(
      { baseUrl: 'https://api.deepseek.com/', thinkingMode: 'disable' },
      { baseUrl: 'https://api.deepseek.com/', thinkingMode: 'auto' },
    )).toEqual({
      baseUrl: 'https://api.deepseek.com/',
      thinkingMode: 'disable',
    })
  })
})
