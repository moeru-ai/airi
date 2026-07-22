import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  getWebApiTicket,
  initSteam,
  resetSteamClientForTests,
  shutdownSteam,
} from './client'
import { STEAM_APP_ID } from './types'

const steamMock = vi.hoisted(() => {
  const getAuthTicketForWebApi = vi.fn()
  const init = vi.fn(() => true)
  const shutdown = vi.fn()
  const setSdkPath = vi.fn()
  const getInstance = vi.fn(() => ({
    init,
    shutdown,
    setSdkPath,
    user: { getAuthTicketForWebApi },
  }))

  return {
    getAuthTicketForWebApi,
    init,
    shutdown,
    setSdkPath,
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

// NOTICE: client.ts now resolves the SDK path from the Electron executable and
// the dev flag, so both modules must be mocked for the node test environment.
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/fake/install/AIRI.app/Contents/MacOS/airi'),
  },
}))

vi.mock('@electron-toolkit/utils', () => ({
  is: { dev: false },
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

  // Regression: macOS .app bundles launch with cwd=/, so the library's cwd-based
  // search never found the SDK placed beside AIRI.app. initSteam now pins the
  // path via setSdkPath resolved from app.getPath('exe') before calling init.
  it('pins SDK path from the executable before init (macOS .app layout)', async () => {
    await initSteam()

    expect(steamMock.setSdkPath).toHaveBeenCalledWith('/fake/install/steamworks_sdk')
    expect(steamMock.init).toHaveBeenCalled()
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
      setSdkPath: steamMock.setSdkPath,
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
