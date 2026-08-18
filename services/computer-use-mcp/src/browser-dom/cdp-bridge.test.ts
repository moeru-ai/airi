import { EventEmitter } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'
import { WebSocket } from 'ws'

import { CdpBridge } from '../browser-dom/cdp-bridge'

afterEach(() => {
  vi.useRealTimers()
})

function attachHeartbeatSocket(bridge: CdpBridge, socket: EventEmitter & {
  readyState: number
  ping: () => void
  terminate: () => void
  close: () => void
}) {
  const internals = bridge as unknown as {
    awaitingHeartbeatPong: boolean
    consecutiveHeartbeatFailures: number
    socket: typeof socket
    status: { connected: boolean }
    startHeartbeat: () => void
  }
  internals.socket = socket
  internals.status.connected = true
  socket.on('pong', () => {
    internals.awaitingHeartbeatPong = false
    internals.consecutiveHeartbeatFailures = 0
  })
  internals.startHeartbeat()
}

describe('cdpBridge', () => {
  it('creates with correct initial status', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const status = bridge.getStatus()
    expect(status.cdpUrl).toBe('http://localhost:9222')
    expect(status.connected).toBe(false)
    expect(status.pageTitle).toBeUndefined()
    expect(status.pageUrl).toBeUndefined()
    expect(status.lastError).toBeUndefined()
  })

  it('formats empty AX tree correctly', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const text = bridge.formatAXTreeAsText({
      nodes: [],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('[Browser AXTree] Example (https://example.com)')
  })

  it('formats AX tree with nodes', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const text = bridge.formatAXTreeAsText({
      nodes: [
        {
          nodeId: '1',
          role: 'RootWebArea',
          name: 'Example Page',
          children: [
            {
              nodeId: '2',
              role: 'heading',
              name: 'Welcome',
              children: [],
            },
            {
              nodeId: '3',
              role: 'textbox',
              name: 'Search',
              value: 'hello world',
              focused: true,
              children: [],
            },
          ],
        },
      ],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('RootWebArea "Example Page"')
    expect(text).toContain('heading "Welcome"')
    expect(text).toContain('textbox "Search" val="hello world" [focused]')
  })

  it('truncates long values in AX tree format', () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    const longValue = 'A'.repeat(200)
    const text = bridge.formatAXTreeAsText({
      nodes: [
        {
          nodeId: '1',
          role: 'textbox',
          value: longValue,
          children: [],
        },
      ],
      pageUrl: 'https://example.com',
      pageTitle: 'Example',
      capturedAt: '2025-01-01T00:00:00.000Z',
    })

    expect(text).toContain('...')
    expect(text).not.toContain('A'.repeat(200))
  })

  it('rejects send when not connected', async () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    await expect(bridge.send('Runtime.evaluate', {})).rejects.toThrow('CDP bridge is not connected')
  })

  it('close is safe to call when not connected', async () => {
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
    })

    // Should not throw
    await bridge.close()
    expect(bridge.getStatus().connected).toBe(false)
  })

  it('keeps the CDP bridge alive when heartbeat pongs arrive', () => {
    vi.useFakeTimers()
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
      heartbeatIntervalMs: 10,
      heartbeatFailureLimit: 3,
    })
    const socket = Object.assign(new EventEmitter(), {
      readyState: WebSocket.OPEN,
      ping: vi.fn(() => socket.emit('pong')),
      terminate: vi.fn(),
      close: vi.fn(),
    })

    attachHeartbeatSocket(bridge, socket)

    vi.advanceTimersByTime(40)

    expect(socket.ping).toHaveBeenCalled()
    expect(socket.terminate).not.toHaveBeenCalled()
    expect(bridge.getStatus().connected).toBe(true)
  })

  it('tears down the CDP bridge after consecutive missed heartbeat pongs', () => {
    vi.useFakeTimers()
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
      heartbeatIntervalMs: 10,
      heartbeatFailureLimit: 3,
    })
    const socket = Object.assign(new EventEmitter(), {
      readyState: WebSocket.OPEN,
      ping: vi.fn(),
      terminate: vi.fn(),
      close: vi.fn(),
    })

    attachHeartbeatSocket(bridge, socket)

    vi.advanceTimersByTime(30)

    expect(socket.ping).toHaveBeenCalledTimes(3)
    expect(socket.terminate).not.toHaveBeenCalled()
    expect(bridge.getStatus().connected).toBe(true)

    vi.advanceTimersByTime(10)

    expect(socket.terminate).toHaveBeenCalledTimes(1)
    expect(bridge.getStatus().connected).toBe(false)
    expect(bridge.getStatus().lastError).toBe('CDP heartbeat failed after 3 consecutive missed pongs')
  })

  it('does not tear down the CDP bridge before the first heartbeat ping can miss', () => {
    vi.useFakeTimers()
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
      heartbeatIntervalMs: 10,
      heartbeatFailureLimit: 1,
    })
    const socket = Object.assign(new EventEmitter(), {
      readyState: WebSocket.OPEN,
      ping: vi.fn(),
      terminate: vi.fn(),
      close: vi.fn(),
    })

    attachHeartbeatSocket(bridge, socket)

    vi.advanceTimersByTime(10)

    expect(socket.ping).toHaveBeenCalledTimes(1)
    expect(socket.terminate).not.toHaveBeenCalled()
    expect(bridge.getStatus().connected).toBe(true)

    vi.advanceTimersByTime(10)

    expect(socket.ping).toHaveBeenCalledTimes(1)
    expect(socket.terminate).toHaveBeenCalledTimes(1)
    expect(bridge.getStatus().connected).toBe(false)
  })

  it('preserves heartbeat ping errors in the bridge status', () => {
    vi.useFakeTimers()
    const bridge = new CdpBridge({
      cdpUrl: 'http://localhost:9222',
      requestTimeoutMs: 10_000,
      heartbeatIntervalMs: 10,
      heartbeatFailureLimit: 3,
    })
    const socket = Object.assign(new EventEmitter(), {
      readyState: WebSocket.OPEN,
      ping: vi.fn(() => {
        throw new Error('CDP ping write failed')
      }),
      terminate: vi.fn(),
      close: vi.fn(),
    })

    attachHeartbeatSocket(bridge, socket)

    vi.advanceTimersByTime(10)

    expect(socket.terminate).toHaveBeenCalledTimes(1)
    expect(bridge.getStatus().connected).toBe(false)
    expect(bridge.getStatus().lastError).toBe('CDP ping write failed')
  })
})
