import type { ElectronMainContextExtensions, ElectronMainEmitOptions } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow, IpcMainEvent } from 'electron'

import { EventEmitter } from 'node:events'
import { setImmediate } from 'node:timers/promises'

import { createContext, defineInvoke } from '@moeru/eventa'
import { shell } from 'electron'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { electronAuthCallback, electronAuthLogout, electronAuthStartLogin } from '../../../shared/eventa'
import { createAuthService } from './auth'

vi.mock('electron', () => ({ shell: { openExternal: vi.fn().mockResolvedValue(undefined) } }))

describe('electron login request ownership', () => {
  const cleanups: Array<() => Promise<void>> = []
  const networkFetch = globalThis.fetch

  afterEach(async () => {
    for (const cleanup of cleanups.splice(0))
      await cleanup()
    vi.restoreAllMocks()
    vi.mocked(shell.openExternal).mockReset().mockResolvedValue(undefined)
  })

  function windowLogin(id: number) {
    const context = createContext<ElectronMainContextExtensions, ElectronMainEmitOptions>()
    const window = Object.assign(new EventEmitter(), { webContents: { id }, isDestroyed: () => false }) as BrowserWindow
    createAuthService({ context, window })
    const options = { raw: { ipcMainEvent: { sender: { id } } as IpcMainEvent, event: undefined } }
    const start = defineInvoke(context, electronAuthStartLogin)
    const logout = defineInvoke(context, electronAuthLogout)
    const received = vi.fn()
    context.on(electronAuthCallback, received)
    cleanups.push(async () => {
      await logout(undefined, options)
    })
    return { start: () => start(undefined, options), logout: () => logout(undefined, options), received, window }
  }

  async function callback(index: number) {
    const authorization = new URL(vi.mocked(shell.openExternal).mock.calls[index]![0])
    const [port, state] = authorization.searchParams.get('state')!.split(':')
    const response = await networkFetch(`http://127.0.0.1:${port}/callback?code=test-code&state=${state}`)
    expect(response.ok).toBe(true)
  }

  // ROOT CAUSE:
  // Closing the loopback does not cancel a token exchange that already started.
  // Only the current login attempt can publish tokens or clear the active attempt.
  it('discards a token exchange after another window starts a new login', async () => {
    const exchange = Promise.withResolvers<Response>()
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockReturnValue(exchange.promise)
    const first = windowLogin(1)
    const second = windowLogin(2)
    await first.start()
    await callback(0)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    await second.start()
    exchange.resolve(Response.json({ access_token: 'discarded', expires_in: 3600 }))
    // Drain the response body and background completion microtasks.
    await setImmediate()
    expect(first.received).not.toHaveBeenCalled()
    // The old completion must not remove the new loopback's cleanup handle.
    await second.logout()
    const url = new URL(vi.mocked(shell.openExternal).mock.calls[1]![0])
    const port = url.searchParams.get('state')!.split(':')[0]
    await vi.waitFor(async () => {
      await expect(networkFetch(`http://127.0.0.1:${port}/callback`)).rejects.toThrow()
    })
  })

  it('publishes only the new login result after replacement', async () => {
    const first = windowLogin(5)
    const second = windowLogin(6)
    await first.start()
    await second.start()
    // Closing the old owner must not cancel the new owner's attempt.
    first.window.emit('closed')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(Response.json({ access_token: 'current', expires_in: 3600 }))
    await callback(1)
    await vi.waitFor(() => expect(second.received).toHaveBeenCalledTimes(1))
    expect(first.received).not.toHaveBeenCalled()
    expect(second.received.mock.calls[0]![0].body.accessToken).toBe('current')
  })

  it('keeps only the latest attempt during concurrent startup', async () => {
    const first = windowLogin(7)
    const second = windowLogin(8)
    await Promise.all([first.start(), second.start()])
    expect(shell.openExternal).toHaveBeenCalledTimes(1)
  })

  it('discards a token exchange after logout', async () => {
    const exchange = Promise.withResolvers<Response>()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(exchange.promise)
    const login = windowLogin(3)
    await login.start()
    await callback(0)
    await login.logout()
    exchange.resolve(Response.json({ access_token: 'discarded', expires_in: 3600 }))
    await setImmediate()
    expect(login.received).not.toHaveBeenCalled()
  })

  it('discards a token exchange after its window closes', async () => {
    const exchange = Promise.withResolvers<Response>()
    vi.spyOn(globalThis, 'fetch').mockReturnValue(exchange.promise)
    const login = windowLogin(4)
    await login.start()
    await callback(0)
    login.window.emit('closed')
    exchange.resolve(Response.json({ access_token: 'discarded', expires_in: 3600 }))
    await setImmediate()
    expect(login.received).not.toHaveBeenCalled()
  })
})
