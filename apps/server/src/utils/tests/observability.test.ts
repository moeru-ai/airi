import { describe, expect, it } from 'vitest'

import { getServerConnectionAttributes, SERVER_ATTR_ADDRESS, SERVER_ATTR_PORT } from '../observability'

describe('getServerConnectionAttributes', () => {
  it('returns host and explicit port attributes for server URLs', () => {
    expect(getServerConnectionAttributes('https://api.airi.moeru.ai:8443/v1')).toEqual({
      [SERVER_ATTR_ADDRESS]: 'api.airi.moeru.ai',
      [SERVER_ATTR_PORT]: 8443,
    })
  })

  it('omits port when URL uses an implicit default port', () => {
    expect(getServerConnectionAttributes('https://api.airi.moeru.ai/v1')).toEqual({
      [SERVER_ATTR_ADDRESS]: 'api.airi.moeru.ai',
    })
  })
})
