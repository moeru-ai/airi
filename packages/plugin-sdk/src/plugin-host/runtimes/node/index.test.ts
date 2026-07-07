import { afterEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createWebSocketHostChannel: vi.fn((socket: unknown) => ({ socket })),
}))

vi.mock('../../../channels/remote/websocket', () => ({
  createWebSocketHostChannel: mocks.createWebSocketHostChannel,
}))

describe('node plugin-host runtime createPluginContext', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: originalWebSocket,
      writable: true,
    })
    mocks.createWebSocketHostChannel.mockClear()
  })

  it('creates a websocket-backed host channel with url and protocols', async () => {
    const constructed: Array<{ protocols?: string[]; url: string }> = []
    class FakeWebSocket {
      constructor(url: string, protocols?: string[]) {
        constructed.push({ protocols, url })
      }

      close() {}
    }
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: FakeWebSocket,
      writable: true,
    })

    const { createPluginContext } = await import('./index')
    const context = createPluginContext({
      kind: 'websocket',
      protocols: ['airi.plugin.v1'],
      url: 'ws://127.0.0.1:49152/ws',
    })

    expect(constructed).toEqual([{ protocols: ['airi.plugin.v1'], url: 'ws://127.0.0.1:49152/ws' }])
    expect(mocks.createWebSocketHostChannel).toHaveBeenCalledTimes(1)
    expect(context).toEqual({ socket: expect.any(FakeWebSocket) })
  })

  it('throws a deterministic error when global WebSocket is unavailable', async () => {
    Object.defineProperty(globalThis, 'WebSocket', {
      configurable: true,
      value: undefined,
      writable: true,
    })

    const { createPluginContext } = await import('./index')

    expect(() =>
      createPluginContext({
        kind: 'websocket',
        url: 'ws://127.0.0.1:49152/ws',
      }),
    ).toThrow('Node runtime WebSocket transport requires globalThis.WebSocket')
  })
})
