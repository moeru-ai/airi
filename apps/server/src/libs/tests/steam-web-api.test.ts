import { afterEach, describe, expect, it, vi } from 'vitest'

import { authenticateUserTicket, checkAppOwnership, getPlayerSummaries } from '../steam-web-api'

describe('authenticateUserTicket', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns steamid when Steam API reports success', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: { params: { result: 'OK', steamid: '76561198000000000' } },
      }),
    }))

    const steamId = await authenticateUserTicket({
      publisherKey: 'test-key',
      appId: '3885340',
      ticketHex: 'deadbeef',
    })

    expect(steamId).toBe('76561198000000000')
  })

  it('throws when result is not OK', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: { params: { result: 'InvalidTicket' } },
      }),
    }))

    await expect(authenticateUserTicket({
      publisherKey: 'test-key',
      appId: '3885340',
      ticketHex: 'bad',
    })).rejects.toThrow(/InvalidTicket/)
  })
})

describe('checkAppOwnership', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns true when owns app', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        appownership: { ownsapp: true },
      }),
    }))

    const owns = await checkAppOwnership({
      publisherKey: 'test-key',
      steamId: '76561198000000000',
      appId: '3885340',
    })

    expect(owns).toBe(true)
  })
})

describe('getPlayerSummaries', () => {
  afterEach(() => vi.restoreAllMocks())

  it('returns name and image from first player', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        response: {
          players: [{
            steamid: '76561198000000001',
            personaname: 'Alice',
            avatarfull: 'https://steamcdn-a.akamaihd.net/avatar_full.jpg',
          }],
        },
      }),
    }))

    const profile = await getPlayerSummaries({
      publisherKey: 'test-key',
      steamId: '76561198000000001',
    })

    expect(profile).toEqual({
      name: 'Alice',
      image: 'https://steamcdn-a.akamaihd.net/avatar_full.jpg',
    })
  })

  it('returns null on HTTP error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    }))

    const profile = await getPlayerSummaries({
      publisherKey: 'test-key',
      steamId: '76561198000000001',
    })

    expect(profile).toBeNull()
  })

  it('returns null when players array is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ response: { players: [] } }),
    }))

    const profile = await getPlayerSummaries({
      publisherKey: 'test-key',
      steamId: '76561198000000001',
    })

    expect(profile).toBeNull()
  })
})
