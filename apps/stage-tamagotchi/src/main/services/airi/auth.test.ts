import type { SteamExchangeResult } from './steam-sign-in'

import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  cancelWebApiTicket,
  getWebApiTicket,
  initSteam,
} from '../steam/client'
import { startSteamSignInFromUserGesture, trySteamSignIn } from './auth'
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

describe('trySteamSignIn', () => {
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
  // success, enrollment, server errors, and thrown failures share one cleanup.
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
    const signIn = trySteamSignIn(windowAuthManager)

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
    await signIn

    expect(cancelWebApiTicketMock).toHaveBeenCalledWith(73)
    expect(windowAuthManager.broadcastAuthCallback).toHaveBeenCalledWith({
      accessToken: 'access-token',
      expiresIn: 3600,
    })
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3642770345
  it('ignores a concurrent steam sign-in while ticket exchange is in flight (PR #1966)', async () => {
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

    const first = trySteamSignIn(windowAuthManager)
    await vi.waitFor(() => {
      expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(1)
    })

    await trySteamSignIn(windowAuthManager)
    expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(1)
    expect(getWebApiTicketMock).toHaveBeenCalledTimes(1)

    finishExchange?.({
      ok: true,
      tokens: {
        accessToken: 'access-token',
        expiresIn: 3600,
      },
    })
    await first
  })

  // https://github.com/moeru-ai/airi/pull/1966#discussion_r3642770345
  it('opens enrollment after silent startup finishes when onboarding clicked during in-flight exchange (PR #1966)', async () => {
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
    const { shell } = await import('electron')
    const openExternal = vi.mocked(shell.openExternal)
    openExternal.mockResolvedValue()

    // ROOT CAUSE:
    //
    // steamSignInInFlight from silent startup used to return immediately for a
    // concurrent user gesture (openBrowserOnNeedsEnrollment=true). Onboarding
    // still closed after IPC, so no enroll tab appeared.
    //
    // We fixed this by waiting for the in-flight silent attempt, then running
    // the user gesture so openExternal can open /enroll.
    const silent = trySteamSignIn(windowAuthManager)
    await vi.waitFor(() => {
      expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(1)
    })

    const userClick = startSteamSignInFromUserGesture(windowAuthManager)

    finishExchange?.({
      ok: false,
      kind: 'needs_enrollment',
      reason: 'Steam account is not linked — enrollment required',
      enrollToken: 'tok-silent',
      authUiUrl: 'https://accounts.airi.build/ui',
    })
    await silent

    // Second exchange (user gesture) still pending until we resolve it.
    await vi.waitFor(() => {
      expect(exchangeSteamTicketForTokensMock).toHaveBeenCalledTimes(2)
    })
    finishExchange?.({
      ok: false,
      kind: 'needs_enrollment',
      reason: 'Steam account is not linked — enrollment required',
      enrollToken: 'tok-user',
      authUiUrl: 'https://accounts.airi.build/ui',
    })
    await userClick

    expect(openExternal).toHaveBeenCalledTimes(1)
    expect(String(openExternal.mock.calls[0]?.[0])).toContain('/enroll')
    expect(String(openExternal.mock.calls[0]?.[0])).toContain('tok-user')
  })
})
