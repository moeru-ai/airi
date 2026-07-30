import type { SteamExchangeResult } from './steam-sign-in'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cancelWebApiTicket,
  getWebApiTicket,
  initSteam,
} from '../steam/client'
import { startSteamTicketSignIn, trySteamSignIn } from './auth'
import { exchangeSteamTicketForTokens } from './steam-sign-in'

vi.mock('../steam/client', () => ({
  cancelWebApiTicket: vi.fn(),
  getWebApiTicket: vi.fn(),
  initSteam: vi.fn(),
}))

vi.mock('./steam-sign-in', () => ({
  exchangeSteamTicketForTokens: vi.fn(),
}))

vi.mock('./http-server/http/auth', () => ({
  startLoopbackServer: vi.fn(async () => ({
    port: 43123,
    close: vi.fn(),
    result: new Promise(() => {}),
  })),
}))

// NOTICE:
// The main-process auth module imports Electron's `shell` runtime boundary.
// This Vitest suite runs in Node and must not load the native Electron runtime.
// Source/context: `apps/stage-tamagotchi/src/main/services/airi/auth.ts`.
// Removal condition: run this suite inside an Electron-enabled Vitest runtime.
vi.mock('electron', () => ({
  shell: { openExternal: vi.fn() },
}))

const cancelWebApiTicketMock = vi.mocked(cancelWebApiTicket)
const exchangeSteamTicketForTokensMock = vi.mocked(exchangeSteamTicketForTokens)
const getWebApiTicketMock = vi.mocked(getWebApiTicket)
const initSteamMock = vi.mocked(initSteam)

describe('startSteamTicketSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initSteamMock.mockResolvedValue({ ok: true })
    getWebApiTicketMock.mockResolvedValue({
      ok: true,
      authTicket: 73,
      ticketHex: 'deadbeef',
    })
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3610725557
  // ROOT CAUSE:
  //
  // The Steam client discarded the Web API ticket handle, so the sign-in
  // orchestration could not cancel it after `/desktop-sign-in` completed.
  // Successful tickets accumulated in the SDK until shutdown and remained
  // valid longer than the one server exchange that needed them.
  //
  // Before the patch, there was no cancellation after the exchange.
  //
  // We fixed this by retaining the handle and cancelling it in `finally`, so
  // success and failure paths share one cleanup.
  it('cancels the Web API ticket after the server exchange completes (PR #1966)', async () => {
    let finishExchange: ((result: SteamExchangeResult) => void) | undefined
    exchangeSteamTicketForTokensMock.mockImplementation(async () => {
      return await new Promise<SteamExchangeResult>((resolve) => {
        finishExchange = resolve
      })
    })

    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }
    const signIn = startSteamTicketSignIn(windowAuthManager)

    await vi.waitFor(() => {
      expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledWith({
        serverUrl: expect.any(String),
        ticketHex: 'deadbeef',
      })
    })
    expect(cancelWebApiTicketMock).not.toHaveBeenCalled()

    finishExchange?.({
      ok: true,
      tokens: {
        accessToken: 'access-token',
        expiresIn: 3600,
      },
    })
    await expect(signIn).resolves.toBe(true)

    expect(cancelWebApiTicketMock).toHaveBeenCalledWith(73)
    expect(windowAuthManager.broadcastAuthCallback).toHaveBeenCalledWith({
      accessToken: 'access-token',
      expiresIn: 3600,
    })
  })

  // A concurrent Steam gesture must not start a second ticket fetch — it waits
  // for the in-flight exchange and relies on the same broadcast reaching every
  // registered window.
  it('waits for an in-flight Steam sign-in instead of starting a second ticket exchange', async () => {
    let finishExchange: ((result: SteamExchangeResult) => void) | undefined
    exchangeSteamTicketForTokensMock.mockImplementation(async () => {
      return await new Promise<SteamExchangeResult>((resolve) => {
        finishExchange = resolve
      })
    })

    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }

    const first = startSteamTicketSignIn(windowAuthManager)
    await vi.waitFor(() => {
      expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(1)
    })

    const second = startSteamTicketSignIn(windowAuthManager)

    finishExchange?.({
      ok: true,
      tokens: { accessToken: 'access-token', expiresIn: 3600 },
    })
    expect(await Promise.all([first, second])).toEqual([true, true])

    expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(1)
    expect(getWebApiTicketMock).toHaveBeenCalledTimes(1)
    expect(windowAuthManager.broadcastAuthCallback).toHaveBeenCalledTimes(1)
  })

  it('returns false and broadcasts an error when the ticket exchange fails', async () => {
    exchangeSteamTicketForTokensMock.mockResolvedValue({
      ok: false,
      reason: 'Steam sign-in failed (503): STEAM_NOT_CONFIGURED',
    })

    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }
    await expect(startSteamTicketSignIn(windowAuthManager)).resolves.toBe(false)

    expect(cancelWebApiTicketMock).toHaveBeenCalledWith(73)
    expect(windowAuthManager.broadcastAuthError).toHaveBeenCalledWith('Steam sign-in failed (503): STEAM_NOT_CONFIGURED')
    expect(windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
  })

  it('returns false when Steam is not available', async () => {
    initSteamMock.mockResolvedValue({ ok: false, reason: 'not_steam' })

    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }
    await expect(startSteamTicketSignIn(windowAuthManager)).resolves.toBe(false)

    expect(getWebApiTicketMock).not.toHaveBeenCalled()
    expect(windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()
  })
})

describe('trySteamSignIn', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    initSteamMock.mockResolvedValue({ ok: true })
    getWebApiTicketMock.mockResolvedValue({
      ok: true,
      authTicket: 73,
      ticketHex: 'deadbeef',
    })
    exchangeSteamTicketForTokensMock.mockResolvedValue({
      ok: true,
      tokens: { accessToken: 'access-token', expiresIn: 3600 },
    })
  })

  it('skips ticket exchange when distribution is not steam', async () => {
    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }

    await trySteamSignIn(windowAuthManager, { distribution: 'direct' })

    expect(initSteamMock).not.toHaveBeenCalled()
    expect(windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
  })

  it('does not broadcast errors on steam distribution failure', async () => {
    exchangeSteamTicketForTokensMock.mockResolvedValue({
      ok: false,
      reason: 'Steam sign-in failed (503): STEAM_NOT_CONFIGURED',
    })

    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }

    await trySteamSignIn(windowAuthManager, { distribution: 'steam' })

    expect(exchangeSteamTicketForTokensMock).toHaveBeenCalled()
    expect(windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()
    expect(windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
  })

  it('broadcasts tokens on steam distribution when ticket exchange succeeds', async () => {
    const windowAuthManager = {
      registerWindow: vi.fn(),
      broadcastAuthCallback: vi.fn(),
      broadcastAuthError: vi.fn(),
    }

    await trySteamSignIn(windowAuthManager, { distribution: 'steam' })

    expect(windowAuthManager.broadcastAuthCallback).toHaveBeenCalledWith({
      accessToken: 'access-token',
      expiresIn: 3600,
    })
  })
})
