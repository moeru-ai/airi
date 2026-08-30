import type { FetchTransportRequest } from '@proj-airi/core-agent'

import { createContext } from '@moeru/eventa'
import { createContext as createElectronMainContext } from '@moeru/eventa/adapters/electron/main'
import { createContext as createElectronRendererContext } from '@moeru/eventa/adapters/electron/renderer'
import { ModelConnectionError } from '@proj-airi/core-agent'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createElectronCustomModelFetchTransport } from '../../../renderer/libs/custom-model-fetch-transport'
import { createCustomModelFetchService } from './custom-model-fetch'

const UPSTREAM_URL = 'https://example.com/v1/chat/completions'

function generateRequest(overrides: Partial<FetchTransportRequest> = {}): FetchTransportRequest {
  return {
    requestId: 'req-1',
    protocol: 'openai-chat-completions',
    operation: 'generate',
    url: UPSTREAM_URL,
    method: 'POST',
    headers: { authorization: 'Bearer sk-test' },
    body: JSON.stringify({ model: 'gpt-test' }),
    ...overrides,
  }
}

function hangingFetch(_input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener('abort', () => {
      reject(init.signal?.reason ?? new Error('aborted'))
    }, { once: true })
  })
}

function createIpcBus() {
  const mainListeners = new Map<string, Set<(event: unknown, payload: unknown) => void>>()

  const ipcMain = {
    on(channel: string, listener: (event: unknown, payload: unknown) => void) {
      const set = mainListeners.get(channel) ?? new Set()
      set.add(listener)
      mainListeners.set(channel, set)
    },
    off(channel: string, listener: (event: unknown, payload: unknown) => void) {
      mainListeners.get(channel)?.delete(listener)
    },
  }

  function createWindowIpc(id: number) {
    const rendererListeners = new Map<string, Set<(event: unknown, payload: unknown) => void>>()
    const webContents = {
      id,
      isDestroyed: () => false,
      once: vi.fn(),
      on: vi.fn(),
      send(channel: string, payload: unknown) {
        for (const listener of rendererListeners.get(channel) ?? [])
          listener({}, payload)
      },
    }
    const window = {
      isDestroyed: () => false,
      webContents,
      once: vi.fn(),
      on: vi.fn(),
    }
    const ipcRenderer = {
      send(channel: string, payload: unknown) {
        const event = { sender: webContents }
        for (const listener of mainListeners.get(channel) ?? [])
          listener(event, payload)
      },
      on(channel: string, listener: (event: unknown, payload: unknown) => void) {
        const set = rendererListeners.get(channel) ?? new Set()
        set.add(listener)
        rendererListeners.set(channel, set)
      },
      removeListener(channel: string, listener: (event: unknown, payload: unknown) => void) {
        rendererListeners.get(channel)?.delete(listener)
      },
    }

    return { window, ipcRenderer }
  }

  return { ipcMain, createWindowIpc }
}

function createMockWindow() {
  const handlers = new Map<string, Array<() => void>>()
  const webContentsHandlers = new Map<string, Array<() => void>>()

  return {
    isDestroyed: () => false,
    on: vi.fn((event: string, handler: () => void) => {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    }),
    once: vi.fn((event: string, handler: () => void) => {
      const list = handlers.get(event) ?? []
      list.push(handler)
      handlers.set(event, list)
    }),
    webContents: {
      id: 1,
      isDestroyed: () => false,
      on: vi.fn((event: string, handler: () => void) => {
        const list = webContentsHandlers.get(event) ?? []
        list.push(handler)
        webContentsHandlers.set(event, list)
      }),
      once: vi.fn((event: string, handler: () => void) => {
        const list = webContentsHandlers.get(event) ?? []
        list.push(handler)
        webContentsHandlers.set(event, list)
      }),
    },
    close() {
      for (const handler of handlers.get('closed') ?? [])
        handler()
    },
    destroyRenderer() {
      for (const handler of webContentsHandlers.get('destroyed') ?? [])
        handler()
    },
  }
}

describe('custom model fetch Eventa lifecycle', () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it('sends generate requests from Main Process and never from Renderer fetch', async () => {
    const rendererFetch = vi.fn(async () => {
      throw new Error('Renderer must not fetch the user URL')
    })
    globalThis.fetch = rendererFetch

    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{"ok":true}', {
        status: 200,
        headers: { 'content-type': 'application/json', 'set-cookie': 'secret=1' },
      })
    })
    const context = createContext()
    const window = createMockWindow()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: window as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)

    const response = await transport.request(generateRequest())

    expect(rendererFetch).not.toHaveBeenCalled()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(UPSTREAM_URL)
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('POST')
    expect(response.status).toBe(200)
    expect(response.headers['content-type']).toBe('application/json')
    expect(response.headers['set-cookie']).toBeUndefined()
    expect(await new Response(response.body).text()).toBe('{"ok":true}')

    service.dispose()
  })

  it('handles a discover invoke when every window context receives the ipc message', async () => {
    // ROOT CAUSE:
    //
    // Eventa's Electron main adapter listens on the shared ipcMain for every
    // window. Discover from Settings ran the fetch handler in Main, Chat, and
    // Settings. The first window stored the requestId. Settings then returned
    // "The transport request id is already in use."
    //
    // The handler now ignores invokes whose ipc sender is not this window.
    const { ipcMain, createWindowIpc } = createIpcBus()
    const settings = createWindowIpc(11)
    const main = createWindowIpc(22)
    const fetchImpl = vi.fn(async () => new Response('{"data":[{"id":"m1"}]}', {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }))
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    const settingsMain = createElectronMainContext(ipcMain as never, settings.window as never)
    const mainMain = createElectronMainContext(ipcMain as never, main.window as never)
    service.registerWindow({
      context: settingsMain.context as never,
      window: settings.window as never,
    })
    service.registerWindow({
      context: mainMain.context as never,
      window: main.window as never,
    })
    const renderer = createElectronRendererContext(settings.ipcRenderer as never)
    const transport = createElectronCustomModelFetchTransport(renderer.context)

    const response = await transport.request(generateRequest({
      requestId: 'req-discover',
      operation: 'list-models',
      method: 'GET',
      url: 'https://example.com/v1/models',
      body: undefined,
    }))

    expect(response.status).toBe(200)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(await new Response(response.body).text()).toBe('{"data":[{"id":"m1"}]}')

    service.dispose()
    settingsMain.dispose()
    mainMain.dispose()
    renderer.dispose()
  })

  it('sends list-models GET requests from Main Process', async () => {
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => {
      return new Response('{"data":[]}', {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    })
    const context = createContext()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: createMockWindow() as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)

    const response = await transport.request(generateRequest({
      requestId: 'req-models',
      operation: 'list-models',
      method: 'GET',
      url: 'https://example.com/v1/models',
      body: undefined,
    }))

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe('https://example.com/v1/models')
    expect(fetchImpl.mock.calls[0]?.[1]?.method).toBe('GET')
    expect(response.status).toBe(200)

    service.dispose()
  })

  it('rejects unknown operations before Main Process fetch', async () => {
    const fetchImpl = vi.fn(async () => new Response('{}'))
    const context = createContext()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: createMockWindow() as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)

    await expect(transport.request(generateRequest({
      operation: 'generate',
      method: 'GET',
    }))).rejects.toBeInstanceOf(ModelConnectionError)
    expect(fetchImpl).not.toHaveBeenCalled()

    service.dispose()
  })

  it('aborts the Main Process upstream request when the Renderer cancels', async () => {
    const fetchImpl = vi.fn(hangingFetch)
    const context = createContext()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: createMockWindow() as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)
    const controller = new AbortController()
    const pending = transport.request(generateRequest({ signal: controller.signal }))

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    controller.abort('user-cancel')

    await expect(pending).rejects.toBe('user-cancel')
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

    service.dispose()
  })

  it('aborts the Main Process upstream request when timeoutMs elapses', async () => {
    const fetchImpl = vi.fn(hangingFetch)
    const context = createContext()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: createMockWindow() as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)

    await expect(transport.request(generateRequest({
      requestId: 'req-timeout',
      timeoutMs: 20,
    }))).rejects.toMatchObject({
      code: 'timeout',
      stage: 'transport',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

    service.dispose()
  })

  it('aborts the Main Process upstream request when the Renderer window closes', async () => {
    const fetchImpl = vi.fn(hangingFetch)
    const context = createContext()
    const window = createMockWindow()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: window as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)
    const pending = transport.request(generateRequest())

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    window.close()

    await expect(pending).rejects.toBeInstanceOf(Error)
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

    service.dispose()
  })

  it('aborts the Main Process upstream request when the Renderer process is destroyed', async () => {
    const fetchImpl = vi.fn(hangingFetch)
    const context = createContext()
    const window = createMockWindow()
    const service = createCustomModelFetchService({ fetch: fetchImpl })
    service.registerWindow({
      context: context as never,
      window: window as never,
    })
    const transport = createElectronCustomModelFetchTransport(context)
    const pending = transport.request(generateRequest({ requestId: 'req-destroyed' }))

    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(1))
    window.destroyRenderer()

    await expect(pending).rejects.toBeInstanceOf(Error)
    expect(fetchImpl.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)

    service.dispose()
  })
})
