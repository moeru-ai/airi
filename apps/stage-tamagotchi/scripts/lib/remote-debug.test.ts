import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CdpClient } from './remote-debug'

afterEach(() => {
  vi.restoreAllMocks()
})

function createMockSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    send: ReturnType<typeof vi.fn>
    close: ReturnType<typeof vi.fn>
    addEventListener: (event: string, listener: (...args: any[]) => void) => void
  }
  socket.send = vi.fn()
  socket.close = vi.fn(() => {
    socket.emit('close')
  })
  socket.addEventListener = (event, listener) => {
    socket.on(event, listener)
  }
  return socket
}

describe('cdpClient', () => {
  it('rejects pending requests when the socket closes', async () => {
    const socket = createMockSocket()
    const client = new CdpClient(socket as never)

    const pending = client.send('Runtime.evaluate', { expression: '1 + 1' })
    expect(socket.send).toHaveBeenCalledTimes(1)

    client.close()

    await expect(pending).rejects.toThrow('CDP socket closed before completing request 1')
    expect(socket.close).toHaveBeenCalledTimes(1)
  })

  it('dispatches protocol events to method listeners without touching pending requests', async () => {
    const socket = createMockSocket()
    const client = new CdpClient(socket as never)
    const listener = vi.fn()
    const unsubscribe = client.on('Runtime.exceptionThrown', listener)

    const pending = client.send('Runtime.enable')
    socket.emit('message', { data: JSON.stringify({ method: 'Runtime.exceptionThrown', params: { exceptionDetails: { text: 'boom' } } }) })
    socket.emit('message', { data: JSON.stringify({ id: 1, result: {} }) })

    await expect(pending).resolves.toEqual({ id: 1, result: {} })
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledWith({ exceptionDetails: { text: 'boom' } })

    unsubscribe()
    socket.emit('message', { data: JSON.stringify({ method: 'Runtime.exceptionThrown', params: {} }) })
    expect(listener).toHaveBeenCalledTimes(1)
  })
})
