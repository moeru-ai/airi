import { describe, expect, it } from 'vitest'

import { nlsMetaEndpointFromRegion, nlsWebSocketEndpointFromRegion } from './utils'

describe('aliyun NLS endpoints', () => {
  // https://github.com/moeru-ai/airi/pull/2290#discussion_r3789204631
  // ROOT CAUSE:
  // The browser helper put a port inside URL.hostname and added -internal
  // twice. The resulting URL kept example.com instead of the NLS gateway.
  it('uses the internal WebSocket gateway with its documented host and port', () => {
    expect(nlsWebSocketEndpointFromRegion('cn-shanghai-internal').toString())
      .toBe('ws://nls-gateway-cn-shanghai-internal.aliyuncs.com/ws/v1')
  })

  // https://github.com/moeru-ai/airi/pull/2290#discussion_r3789204630
  it('uses HTTPS for the token endpoint', () => {
    expect(nlsMetaEndpointFromRegion('cn-shanghai').protocol).toBe('https:')
  })
})
