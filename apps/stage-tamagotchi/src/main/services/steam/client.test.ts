import { STEAM_APP_ID } from '@proj-airi/stage-shared/steam'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getWebApiTicket,
  initSteam,
  resetSteamClientForTests,
  shutdownSteam,
} from './client'

const steamMock = vi.hoisted(() => {
  const getAuthTicketForWebApi = vi.fn()
  const init = vi.fn(() => true)
  const shutdown = vi.fn()
  const getInstance = vi.fn(() => ({
    init,
    shutdown,
    user: { getAuthTicketForWebApi },
  }))

  return {
    getAuthTicketForWebApi,
    init,
    shutdown,
    getInstance,
  }
})

vi.mock('steamworks-ffi-node', () => ({
  SteamworksSDK: {
    getInstance: steamMock.getInstance,
  },
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      debug: vi.fn(),
      warn: vi.fn(),
      withError: () => ({
        debug: vi.fn(),
        warn: vi.fn(),
      }),
    }),
  }),
}))

describe('initSteam', () => {
  beforeEach(() => {
    resetSteamClientForTests()
    steamMock.init.mockReturnValue(true)
    steamMock.getAuthTicketForWebApi.mockReset()
  })

  afterEach(() => {
    resetSteamClientForTests()
    vi.clearAllMocks()
  })

  it('returns ok when SteamAPI_Init succeeds', async () => {
    const result = await initSteam()

    expect(result).toEqual({ ok: true })
    expect(steamMock.getInstance).toHaveBeenCalled()
    expect(steamMock.init).toHaveBeenCalledWith({ appId: STEAM_APP_ID })
  })

  it('returns init_failed when SteamAPI_Init returns false', async () => {
    steamMock.init.mockReturnValue(false)

    const result = await initSteam()

    expect(result).toEqual({ ok: false, reason: 'init_failed' })
  })

  it('returns api_unavailable when web api ticket API is missing', async () => {
    steamMock.getInstance.mockReturnValueOnce({
      init: steamMock.init,
      shutdown: steamMock.shutdown,
      user: {},
    } as ReturnType<typeof steamMock.getInstance>)

    const result = await initSteam()

    expect(result).toEqual({ ok: false, reason: 'api_unavailable' })
  })
})

describe('getWebApiTicket', () => {
  beforeEach(async () => {
    resetSteamClientForTests()
    steamMock.init.mockReturnValue(true)
    steamMock.getAuthTicketForWebApi.mockResolvedValue({
      success: true,
      ticketHex: 'deadbeef',
    })
    await initSteam()
  })

  afterEach(() => {
    resetSteamClientForTests()
    vi.clearAllMocks()
  })

  it('returns ticket hex for the configured web api identity', async () => {
    const result = await getWebApiTicket()

    expect(result).toEqual({ ok: true, ticketHex: 'deadbeef' })
    expect(steamMock.getAuthTicketForWebApi).toHaveBeenCalledWith({
      genericString: 'airi-desktop',
    })
  })

  it('maps Steam API failure to ok false', async () => {
    steamMock.getAuthTicketForWebApi.mockResolvedValue({
      success: false,
      error: 'not logged on',
    })

    const result = await getWebApiTicket()

    expect(result).toEqual({ ok: false, reason: 'not logged on' })
  })

  it('returns not initialized when Steam was never started', async () => {
    shutdownSteam()

    const result = await getWebApiTicket()

    expect(result).toEqual({ ok: false, reason: 'Steam is not initialized' })
  })
})
