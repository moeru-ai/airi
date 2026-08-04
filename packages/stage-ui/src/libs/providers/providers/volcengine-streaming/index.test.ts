import { describe, expect, it } from 'vitest'

import { providerVolcengineStreaming, VOLCENGINE_STREAMING_PROVIDER_ID } from './index'

describe('volcengine streaming provider', () => {
  it('keeps BYOK separate from the existing volcengine provider identity', () => {
    expect(VOLCENGINE_STREAMING_PROVIDER_ID).toBe('volcengine-streaming')
    expect(providerVolcengineStreaming.id).toBe('volcengine-streaming')
    expect(providerVolcengineStreaming.capabilities?.speech?.transport).toBe('bidirectional-ws')

    const connection = providerVolcengineStreaming.capabilities?.speech?.resolveConnection?.({
      apiKey: '  user-x-api-key  ',
    })
    expect(connection).toEqual({
      credentialMode: 'byok',
      providerId: 'volcengine-streaming',
      apiKey: 'user-x-api-key',
    })
  })

  it('requires an X-Api-Key before the provider becomes configured', async () => {
    const validator = providerVolcengineStreaming.validators?.validateConfig?.[0]?.({ t: input => input })
    expect(validator).toBeDefined()

    const missing = await validator!.validator({ apiKey: '' }, { t: input => input })
    const configured = await validator!.validator({ apiKey: 'user-key' }, { t: input => input })

    expect(missing.valid).toBe(false)
    expect(missing.reason).toBe('X-Api-Key is required.')
    expect(configured.valid).toBe(true)
    expect(configured.reason).toBe('')
  })
})
