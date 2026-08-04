import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const steamMock = vi.hoisted(() => {
  const cancelAuthTicket = vi.fn()
  const getAuthTicketForWebApi = vi.fn()
  const init = vi.fn(() => true)
  const shutdown = vi.fn()
  const setSdkPath = vi.fn()
  const getInstance = vi.fn(() => ({
    init,
    shutdown,
    setSdkPath,
    user: { cancelAuthTicket, getAuthTicketForWebApi },
  }))

  return {
    cancelAuthTicket,
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

type SteamClientModule = typeof import('./client')

let client: SteamClientModule

beforeEach(async () => {
  // NOTICE:
  // client.ts keeps module-level SDK state (steam/steamInitialized), so each
  // test re-imports a fresh module instead of relying on a test-only reset
  // export from production code.
  vi.resetModules()
  steamMock.init.mockReturnValue(true)
  steamMock.getAuthTicketForWebApi.mockReset()
  client = await import('./client')
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('initSteam', () => {
  it('returns ok when SteamAPI_Init succeeds', async () => {
    const result = await client.initSteam()

    expect(result).toEqual({ ok: true })
    expect(steamMock.getInstance).toHaveBeenCalled()
    expect(steamMock.init).toHaveBeenCalledWith({ appId: 3885340 })
  })

  // Regression: macOS .app bundles launch with cwd=/, so the library's cwd-based
  // search never found the SDK placed beside AIRI.app. initSteam now pins the
  // path via setSdkPath resolved from app.getPath('exe') before calling init.
  it('pins SDK path from the executable before init (macOS .app layout)', async () => {
    await client.initSteam()

    expect(steamMock.setSdkPath).toHaveBeenCalledWith('/fake/install/steamworks_sdk')
    expect(steamMock.init).toHaveBeenCalled()
  })

  it('returns init_failed when SteamAPI_Init returns false', async () => {
    steamMock.init.mockReturnValue(false)

    const result = await client.initSteam()

    expect(result).toEqual({ ok: false, reason: 'init_failed' })
  })

  it('returns api_unavailable when web api ticket API is missing', async () => {
    steamMock.getInstance.mockReturnValueOnce({
      init: steamMock.init,
      shutdown: steamMock.shutdown,
      setSdkPath: steamMock.setSdkPath,
      user: {},
    } as ReturnType<typeof steamMock.getInstance>)

    const result = await client.initSteam()

    expect(result).toEqual({ ok: false, reason: 'api_unavailable' })
  })
})

describe('getWebApiTicket', () => {
  beforeEach(async () => {
    steamMock.cancelAuthTicket.mockReset()
    steamMock.getAuthTicketForWebApi.mockResolvedValue({
      success: true,
      authTicket: 73,
      ticketHex: 'deadbeef',
    })
    await client.initSteam()
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610725557
  // ROOT CAUSE:
  //
  // `getAuthTicketForWebApi()` returned both the ticket bytes and the
  // `authTicket` handle needed by Steam's `CancelAuthTicket`, but this wrapper
  // discarded the handle and exposed only `ticketHex`. Callers therefore had
  // no way to cancel a successful ticket after server authentication.
  //
  // Before the patch: `{ ok: true, ticketHex: 'deadbeef' }`.
  //
  // We fixed this by preserving the handle until the caller finishes the
  // `/desktop-sign-in` exchange and explicitly cancels it.
  it('returns the handle required to cancel a Web API ticket (PR #1966)', async () => {
    const result = await client.getWebApiTicket()

    expect(result).toEqual({ ok: true, authTicket: 73, ticketHex: 'deadbeef' })
    expect(steamMock.getAuthTicketForWebApi).toHaveBeenCalledWith({
      genericString: 'airi-desktop',
    })
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610725557
  it('cancels a Web API ticket through the initialized Steam SDK (PR #1966)', () => {
    client.cancelWebApiTicket(73)

    expect(steamMock.cancelAuthTicket).toHaveBeenCalledWith(73)
  })

  it('maps Steam API failure to ok false', async () => {
    steamMock.getAuthTicketForWebApi.mockResolvedValue({
      success: false,
      error: 'not logged on',
    })

    const result = await client.getWebApiTicket()

    expect(result).toEqual({ ok: false, reason: 'not logged on' })
  })

  it('returns not initialized when Steam was never started', async () => {
    client.shutdownSteam()

    const result = await client.getWebApiTicket()

    expect(result).toEqual({ ok: false, reason: 'Steam is not initialized' })
  })
})
