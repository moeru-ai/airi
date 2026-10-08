import { afterEach, describe, expect, it, vi } from 'vitest'

import { KWinCursorBridge } from './kwin-cursor-bridge'

class MockSocket {
  private listeners = {
    close: [] as (() => void)[],
    error: [] as ((error: unknown) => void)[],
    message: [] as ((data: unknown) => void)[],
  }

  onClose(listener: () => void) {
    this.listeners.close.push(listener)
  }

  onError(listener: (error: unknown) => void) {
    this.listeners.error.push(listener)
  }

  onMessage(listener: (data: unknown) => void) {
    this.listeners.message.push(listener)
  }

  emitClose() {
    for (const listener of this.listeners.close)
      listener()
  }

  emitError(error: unknown = new Error('socket failed')) {
    for (const listener of this.listeners.error)
      listener(error)
  }

  emitMessage(data: unknown) {
    for (const listener of this.listeners.message)
      listener(data)
  }

  close() {
    this.emitClose()
  }
}

function snapshot(cursorX = 320, cursorY = 240) {
  return JSON.stringify({
    cursor: { x: cursorX, y: cursorY },
    version: 1,
    windows: [{
      bounds: { height: 400, width: 500, x: 100, y: 80 },
      title: 'AIRI',
    }],
  })
}

describe('KWinCursorBridge', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  // https://github.com/moeru-ai/airi/issues/2701
  // ROOT CAUSE:
  //
  // Electron's global cursor and window-origin values are not authoritative on native Wayland.
  // The bridge uses KWin's compositor snapshot and must discard it when the socket closes.
  it('uses compositor coordinates for Issue #2701 and clears them after disconnect', () => {
    const socket = new MockSocket()
    const reportUnavailable = vi.fn()
    const bridge = new KWinCursorBridge({
      createSocket: () => socket,
      reportUnavailable,
    })

    bridge.start()
    expect(bridge.getCursorScreenPoint()).toBeUndefined()

    socket.emitMessage(snapshot())
    expect(bridge.getCursorScreenPoint()).toEqual({ x: 320, y: 240 })
    expect(bridge.getWindowBounds('AIRI')).toEqual({ x: 100, y: 80, width: 500, height: 400 })
    expect(bridge.getWindowBounds('Settings')).toBeUndefined()
    expect(reportUnavailable).toHaveBeenCalledOnce()
    socket.emitMessage(JSON.stringify({
      cursor: { x: 320, y: 240 },
      version: 1,
      windows: [
        { bounds: { height: 400, width: 500, x: 100, y: 80 }, title: 'AIRI' },
        { bounds: { height: 400, width: 500, x: 600, y: 80 }, title: 'AIRI' },
      ],
    }))
    expect(bridge.getWindowBounds('AIRI')).toBeUndefined()
    expect(reportUnavailable).toHaveBeenCalledTimes(2)

    socket.emitClose()
    expect(bridge.getCursorScreenPoint()).toBeUndefined()
    expect(bridge.getWindowBounds('AIRI')).toBeUndefined()
    bridge.stop()
  })

  it('rejects malformed compositor snapshots and reconnects after a close', () => {
    vi.useFakeTimers()
    const sockets: MockSocket[] = []
    const reportUnavailable = vi.fn()
    const bridge = new KWinCursorBridge({
      createSocket: () => {
        const socket = new MockSocket()
        sockets.push(socket)
        return socket
      },
      reportUnavailable,
    })

    bridge.start()
    sockets[0].emitMessage('{')
    expect(bridge.getCursorScreenPoint()).toBeUndefined()
    expect(reportUnavailable).toHaveBeenCalledOnce()
    expect(reportUnavailable).toHaveBeenCalledWith(expect.any(String), expect.any(SyntaxError))

    sockets[0].emitClose()
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)
    bridge.stop()
    vi.advanceTimersByTime(1000)
    expect(sockets).toHaveLength(2)
  })

  it('reports socket construction and transport errors', () => {
    const socket = new MockSocket()
    const reportUnavailable = vi.fn()
    const failure = new Error('socket failed')
    const bridge = new KWinCursorBridge({
      createSocket: () => {
        throw failure
      },
      reportUnavailable,
    })

    bridge.start()
    expect(reportUnavailable).toHaveBeenCalledWith(expect.any(String), failure)
    bridge.stop()

    const connectedBridge = new KWinCursorBridge({
      createSocket: () => socket,
      reportUnavailable,
    })
    connectedBridge.start()
    socket.emitMessage(snapshot())
    socket.emitError(failure)
    expect(connectedBridge.getCursorScreenPoint()).toBeUndefined()
    expect(reportUnavailable).toHaveBeenLastCalledWith(expect.any(String), failure)
    connectedBridge.stop()
  })

  it('clears snapshots when the compositor stops sending heartbeats', () => {
    vi.useFakeTimers()
    const socket = new MockSocket()
    const reportUnavailable = vi.fn()
    const bridge = new KWinCursorBridge({
      createSocket: () => socket,
      reportUnavailable,
    })

    bridge.start()
    socket.emitMessage(snapshot())
    expect(bridge.getCursorScreenPoint()).toEqual({ x: 320, y: 240 })

    vi.advanceTimersByTime(1750)
    expect(bridge.getCursorScreenPoint()).toBeUndefined()
    expect(reportUnavailable).toHaveBeenLastCalledWith(expect.any(String), expect.any(Error))
    bridge.stop()
  })
})
