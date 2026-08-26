import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { CdpClient } from './desktop-overlay-live-window-smoke'

afterEach(() => {
  vi.restoreAllMocks()
})

function createMockSocket() {
  const socket = new EventEmitter() as EventEmitter & {
    addEventListener: (event: string, listener: (...args: any[]) => void) => void
    close: ReturnType<typeof vi.fn>
    send: ReturnType<typeof vi.fn>
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
})
