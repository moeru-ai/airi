import { describe, expect, it, vi } from 'vitest'

import { ensureServerChannelConfigDefaults } from './config'

describe('ensureServerChannelConfigDefaults', () => {
  it('keeps an existing auth token', () => {
    const generateToken = vi.fn(() => 'generated-token')

    const result = ensureServerChannelConfigDefaults({
      authToken: 'existing-token',
      hostname: '0.0.0.0',
      tlsConfig: null,
    }, generateToken)

    expect(result.changed).toBe(false)
    expect(result.config).toEqual({
      authToken: 'existing-token',
      hostname: '0.0.0.0',
      tlsConfig: null,
    })
    expect(generateToken).not.toHaveBeenCalled()
  })

  it('generates a token when the config is missing one', () => {
    const generateToken = vi.fn(() => 'generated-token')

    const result = ensureServerChannelConfigDefaults({
      authToken: '',
      hostname: '',
      tlsConfig: null,
    }, generateToken)

    expect(result.changed).toBe(true)
    expect(result.config).toEqual({
      authToken: 'generated-token',
      hostname: '127.0.0.1',
      tlsConfig: null,
    })
    expect(generateToken).toHaveBeenCalledOnce()
  })
})
