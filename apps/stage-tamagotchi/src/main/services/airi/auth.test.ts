import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createAuthService } from './auth'

type InvokeHandler = (payload: unknown, options: unknown) => Promise<void>

interface LoopbackMock {
  close: ReturnType<typeof vi.fn>
  port: number
  result: Promise<{ code: string }>
}

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })

  return { promise, reject, resolve }
}

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, InvokeHandler>(),
  openExternal: vi.fn(async () => {}),
  startLoopbackServer: vi.fn(),
}))

vi.mock('@guiiai/logg', () => ({
  useLogg: () => ({
    useGlobalConfig: () => ({
      log: vi.fn(),
      withError: vi.fn(() => ({ error: vi.fn() })),
      withFields: vi.fn(() => ({ warn: vi.fn() })),
    }),
  }),
}))

vi.mock('@moeru/eventa', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@moeru/eventa')>()
  return {
    ...actual,
    defineInvokeHandler: (_context: unknown, eventa: { sendEvent: { id: string } }, handler: InvokeHandler) => {
      mocks.handlers.set(eventa.sendEvent.id.replace(/-send$/, ''), handler)
    },
  }
})

vi.mock('@proj-airi/stage-shared/auth', () => ({
  generateCodeChallenge: vi.fn(async () => 'challenge'),
  generateCodeVerifier: vi.fn(() => 'verifier'),
  generateState: vi.fn(() => 'state'),
}))

vi.mock('electron', () => ({
  shell: {
    openExternal: mocks.openExternal,
  },
}))

vi.mock('./http-server/http/auth', () => ({
  startLoopbackServer: mocks.startLoopbackServer,
}))

function invokeOptions(windowId: number) {
  return {
    raw: {
      ipcMainEvent: {
        sender: { id: windowId },
      },
    },
  }
}

function createLoopback(result: Promise<{ code: string }>, close: () => void, port: number): LoopbackMock {
  return {
    close: vi.fn(close),
    port,
    result,
  }
}

function registerAuthService() {
  const windowId = 7
  const windowAuthManager = {
    broadcastAuthCallback: vi.fn(),
    broadcastAuthError: vi.fn(),
    registerWindow: vi.fn(),
  }
  const window = {
    on: vi.fn(),
    webContents: { id: windowId },
  }

  createAuthService({
    context: {} as never,
    window: window as never,
    windowAuthManager,
  })

  return {
    login: mocks.handlers.get('eventa:invoke:electron:auth:start-login')!,
    logout: mocks.handlers.get('eventa:invoke:electron:auth:logout')!,
    options: invokeOptions(windowId),
    windowAuthManager,
  }
}

async function flushAsyncHandlers() {
  await new Promise(resolve => setTimeout(resolve, 0))
}

describe('createAuthService', () => {
  let cleanup: (() => Promise<void>) | undefined

  beforeEach(() => {
    mocks.handlers.clear()
    vi.clearAllMocks()
  })

  afterEach(async () => {
    await cleanup?.()
    cleanup = undefined
    vi.unstubAllGlobals()
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('silences a replaced attempt cancellation without losing the active attempt (Issue #2182)', async () => {
    const firstResult = deferred<{ code: string }>()
    const firstLoopback = createLoopback(
      firstResult.promise,
      () => firstResult.reject(new Error('OIDC sign-in attempt cancelled')),
      41001,
    )
    const secondLoopback = createLoopback(new Promise(() => {}), () => {}, 41002)
    mocks.startLoopbackServer
      .mockResolvedValueOnce(firstLoopback)
      .mockResolvedValueOnce(secondLoopback)

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    await service.login(undefined, service.options)
    await service.login(undefined, service.options)
    await flushAsyncHandlers()

    expect(firstLoopback.close).toHaveBeenCalledTimes(1)
    expect(service.windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()

    await service.logout(undefined, service.options)
    expect(secondLoopback.close).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('closes a replaced loopback that finishes starting late (Issue #2182)', async () => {
    const firstServer = deferred<LoopbackMock>()
    const firstResult = deferred<{ code: string }>()
    const firstLoopback = createLoopback(
      firstResult.promise,
      () => firstResult.reject(new Error('OIDC sign-in attempt cancelled')),
      41001,
    )
    const secondLoopback = createLoopback(new Promise(() => {}), () => {}, 41002)
    mocks.startLoopbackServer
      .mockReturnValueOnce(firstServer.promise)
      .mockResolvedValueOnce(secondLoopback)

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    const firstLogin = service.login(undefined, service.options)
    await vi.waitFor(() => expect(mocks.startLoopbackServer).toHaveBeenCalledTimes(1))
    await service.login(undefined, service.options)

    firstServer.resolve(firstLoopback)
    await firstLogin
    await flushAsyncHandlers()

    expect(firstLoopback.close).toHaveBeenCalledTimes(1)
    expect(mocks.openExternal).toHaveBeenCalledTimes(1)
    expect(service.windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
    expect(service.windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()

    await service.logout(undefined, service.options)
    expect(secondLoopback.close).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('does not publish or clean up a superseded token exchange (Issue #2182)', async () => {
    const firstResult = deferred<{ code: string }>()
    const tokenResponse = deferred<Response>()
    const firstLoopback = createLoopback(firstResult.promise, () => {}, 41001)
    const secondLoopback = createLoopback(new Promise(() => {}), () => {}, 41002)
    mocks.startLoopbackServer
      .mockResolvedValueOnce(firstLoopback)
      .mockResolvedValueOnce(secondLoopback)
    vi.stubGlobal('fetch', vi.fn(() => tokenResponse.promise))

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    await service.login(undefined, service.options)
    firstResult.resolve({ code: 'old-code' })
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1))

    await service.login(undefined, service.options)
    tokenResponse.resolve(new Response(JSON.stringify({
      access_token: 'old-access-token',
      expires_in: 3600,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    }))
    await flushAsyncHandlers()

    expect(service.windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()

    await service.logout(undefined, service.options)
    expect(secondLoopback.close).toHaveBeenCalledTimes(1)
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('still publishes tokens from the active attempt (Issue #2182)', async () => {
    const result = deferred<{ code: string }>()
    const loopback = createLoopback(result.promise, () => {}, 41001)
    mocks.startLoopbackServer.mockResolvedValueOnce(loopback)
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      access_token: 'active-access-token',
      refresh_token: 'active-refresh-token',
      expires_in: 3600,
    }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    })))

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    await service.login(undefined, service.options)
    result.resolve({ code: 'active-code' })

    await vi.waitFor(() => expect(service.windowAuthManager.broadcastAuthCallback).toHaveBeenCalledWith({
      accessToken: 'active-access-token',
      expiresIn: 3600,
      idToken: undefined,
      refreshToken: 'active-refresh-token',
    }))
    expect(service.windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('still publishes errors from the active attempt (Issue #2182)', async () => {
    const result = deferred<{ code: string }>()
    const loopback = createLoopback(result.promise, () => {}, 41001)
    mocks.startLoopbackServer.mockResolvedValueOnce(loopback)

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    await service.login(undefined, service.options)
    result.reject(new Error('OIDC callback timed out'))

    await vi.waitFor(() => expect(service.windowAuthManager.broadcastAuthError).toHaveBeenCalledWith('OIDC callback timed out'))
    expect(service.windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
  })

  // https://github.com/moeru-ai/airi/issues/2182
  it('silences cancellation when logout closes the active attempt (Issue #2182)', async () => {
    const result = deferred<{ code: string }>()
    const loopback = createLoopback(
      result.promise,
      () => result.reject(new Error('OIDC sign-in attempt cancelled')),
      41001,
    )
    mocks.startLoopbackServer.mockResolvedValueOnce(loopback)

    const service = registerAuthService()
    cleanup = () => service.logout(undefined, service.options)

    await service.login(undefined, service.options)
    await service.logout(undefined, service.options)
    await flushAsyncHandlers()

    expect(loopback.close).toHaveBeenCalledTimes(1)
    expect(service.windowAuthManager.broadcastAuthCallback).not.toHaveBeenCalled()
    expect(service.windowAuthManager.broadcastAuthError).not.toHaveBeenCalled()
  })
})
