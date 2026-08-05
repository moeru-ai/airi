import { afterEach, describe, expect, it, vi } from 'vitest'

import { authenticateUserTicket } from '../steam-web-api'

describe('authenticateUserTicket', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns steamid when Steam API reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { params: { result: 'OK', steamid: '76561198000000000' } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    const steamId = await authenticateUserTicket({
      publisherKey: 'test-key',
      appId: '3885340',
      ticketHex: 'deadbeef',
    })

    expect(steamId).toBe('76561198000000000')
  })

  it('throws when result is not OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      response: { params: { result: 'InvalidTicket' } },
    }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })))

    await expect(authenticateUserTicket({
      publisherKey: 'test-key',
      appId: '3885340',
      ticketHex: 'bad',
    })).rejects.toThrow(/InvalidTicket/)
  })
})
