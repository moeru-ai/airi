import type { Message as CrossWsMessage, Peer as CrossWsPeer } from 'crossws'

import { describe, expect, it, vi } from 'vitest'

import { createServer, toCrossWsHooks } from './server'

import * as betterWs from './index'

function errorText(error: unknown) {
  if (typeof error === 'object' && error !== null && 'message' in error && typeof error.message === 'string') {
    return error.message
  }

  return String(error)
}

class FakeWebSocket extends EventTarget implements WebSocket {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSING = 2
  static readonly CLOSED = 3
  static readonly instances: FakeWebSocket[] = []

  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSING = 2
  readonly CLOSED = 3
  binaryType: BinaryType = 'blob'
  readonly bufferedAmount = 0
  readonly extensions = ''
  onclose: ((this: WebSocket, ev: CloseEvent) => unknown) | null = null
  onerror: ((this: WebSocket, ev: Event) => unknown) | null = null
  onmessage: ((this: WebSocket, ev: MessageEvent<string>) => unknown) | null = null
  onopen: ((this: WebSocket, ev: Event) => unknown) | null = null
  readonly protocol = ''
  readonly readyState = FakeWebSocket.CONNECTING

  readonly sent: string[] = []

  readonly url: string

  constructor(url: string | URL) {
    super()
    this.url = String(url)
    FakeWebSocket.instances.push(this)
  }

  send(message: string | ArrayBufferLike | Blob | ArrayBufferView) {
    if (typeof message === 'string') {
      this.sent.push(message)
    }
  }

  close() {}

  open() {
    this.onopen?.(new Event('open'))
  }

  error() {
    this.onerror?.(new Event('error'))
  }

  closeEvent() {
    this.onclose?.(new CloseEvent('close', { code: 1006, reason: 'open failed', wasClean: false }))
  }

  receive(message: string) {
    this.onmessage?.(new MessageEvent('message', { data: message }))
  }
}

function createFakeSocketClient() {
  const client = betterWs.createClient({
    url: 'ws://localhost/ws',
    wsConstructor: FakeWebSocket,
  })
  const socket = () => {
    const instance = FakeWebSocket.instances.at(-1)
    if (!instance) {
      throw new Error('FakeWebSocket was not constructed.')
    }
    return instance
  }
  return {
    client,
    get socket() {
      return socket()
    },
  }
}

describe('better-ws package exports', () => {
  it('keeps server APIs behind the server subpath', () => {
    expect('createClient' in betterWs).toBe(true)
    expect('createServer' in betterWs).toBe(false)
  })
})

describe('better-ws server runtime', () => {
  it('exposes peers through a peer manager object', () => {
    const server = createServer<string>()
    const sent: string[] = []

    const peer = server.peers.accept({
      id: 'peer-1',
      send: message => sent.push(message),
    }).peer

    peer.send('hello')

    expect(server.peers.has('peer-1')).toBe(true)
    expect(server.peers.get('peer-1')).toBe(peer)
    expect(server.peers.list()).toEqual([peer])
    expect([...server.peers.entries()]).toEqual([['peer-1', peer]])
    expect(sent).toEqual(['hello'])
  })

  it('keeps server-level accept and remove as peer manager shortcuts', () => {
    const server = createServer<string>()

    const peer = server.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    })
    server.remove('peer-1')

    expect(peer.id).toBe('peer-1')
    expect(server.peers.has('peer-1')).toBe(false)
  })

  it('keeps replacement accepted during adapter close', () => {
    const server = createServer<string>()
    const replacementSend = vi.fn(() => true)
    const first = server.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
      close: () => {
        server.accept({
          id: 'peer-1',
          send: replacementSend,
        })
      },
    })

    first.close()
    server.peers.get('peer-1')?.send('replacement')

    expect(server.peers.has('peer-1')).toBe(true)
    expect(replacementSend).toHaveBeenCalledExactlyOnceWith('replacement')
  })

  it('continues closing peers after one peer close throws during closeAll', () => {
    const server = createServer<string>()
    const firstClose = vi.fn(() => {
      throw new Error('first close failed')
    })
    const secondClose = vi.fn()

    server.accept({
      id: 'first',
      send: vi.fn(() => true),
      close: firstClose,
    })
    server.accept({
      id: 'second',
      send: vi.fn(() => true),
      close: secondClose,
    })

    expect(() => server.close()).toThrow('first close failed')
    expect(firstClose).toHaveBeenCalledOnce()
    expect(secondClose).toHaveBeenCalledOnce()
    expect(server.peers.size).toBe(0)
  })

  it('cleans empty group records after peers leave or are removed', () => {
    const server = createServer<string>()
    const peer = server.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    peer.join('room:a')
    peer.leave('room:a')
    peer.join('room:b')
    server.remove('peer-1')

    expect(server.to('room:a').send('stale-room')).toEqual([])
    expect(server.to('room:b').send('stale-room')).toEqual([])
  })

  it('registers peers, dispatches raw messages, and disposes peer handlers', () => {
    const server = createServer<string>()
    const sent: string[] = []
    const received: Array<{ peerId: string, message: string }> = []
    const unsubscribe = server.onMessage((context) => {
      received.push({ peerId: context.peer.id, message: context.message })
    })

    const peer = server.accept({
      id: 'peer-1',
      send: (message) => {
        sent.push(message)
        return true
      },
    })

    peer.receive('hello')
    peer.send('reply')
    unsubscribe()
    peer.receive('ignored')

    expect(server.peers.size).toBe(1)
    expect(received).toEqual([{ peerId: 'peer-1', message: 'hello' }])
    expect(sent).toEqual(['reply'])
  })

  it('broadcasts to all peers and sends to named groups only', () => {
    const server = createServer<string>()
    const firstSent: string[] = []
    const secondSent: string[] = []

    const first = server.accept({ id: 'first', send: message => firstSent.push(message) })
    server.accept({
      id: 'second',
      send: (message) => {
        secondSent.push(message)
      },
    })

    first.join('room:a')

    const broadcast = server.broadcast('global')
    const room = server.to('room:a').send('room-only')

    expect(broadcast).toEqual([
      { peerId: 'first', ok: true },
      { peerId: 'second', ok: true },
    ])
    expect(room).toEqual([{ peerId: 'first', ok: true }])
    expect(firstSent).toEqual(['global', 'room-only'])
    expect(secondSent).toEqual(['global'])
  })

  it('adapts CrossWS hooks into server peers and raw messages', () => {
    const server = createServer<string>()
    const received: string[] = []
    const sent: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })

    const hooks = toCrossWsHooks(server)
    const peer = {
      id: 'crossws-peer',
      send: (message: unknown) => {
        sent.push(String(message))
      },
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS peers and messages are runtime-owned objects with a wider shape
    // than better-ws needs here. The fake only models the fields used by the
    // adapter, so the cast stays local to this adapter-boundary test.
    // Remove this when CrossWS provides a small public testing fixture type.
    hooks.open?.(peer as unknown as CrossWsPeer)
    hooks.message?.(peer as unknown as CrossWsPeer, { text: () => 'hello' } as unknown as CrossWsMessage)
    server.peers.get('crossws-peer')?.send('reply')

    expect(received).toEqual(['hello'])
    expect(sent).toEqual(['reply'])
  })

  it('removes CrossWS peers without closing an already closed raw connection', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const peer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS close hooks receive runtime-owned peers. This fake keeps the test
    // focused on better-ws registry cleanup instead of depending on CrossWS
    // internals. Remove this when CrossWS exposes a narrow fake peer helper.
    hooks.open?.(peer as unknown as CrossWsPeer)
    await hooks.close?.(peer as unknown as CrossWsPeer, { code: 1000, reason: 'done' })

    expect(server.peers.has('crossws-peer')).toBe(false)
    expect(peer.close).not.toHaveBeenCalled()
  })

  it('passes CrossWS close details to peer close handlers', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const closed: Array<{ peerId: string, code?: number, reason?: string }> = []
    server.onPeerClose(({ peerId, details }) => {
      closed.push({
        peerId,
        code: details?.code,
        reason: details?.reason,
      })
    })
    const peer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    hooks.open?.(peer as unknown as CrossWsPeer)
    await hooks.close?.(peer as unknown as CrossWsPeer, { code: 1001, reason: 'runtime close' })

    expect(closed).toEqual([{ peerId: 'crossws-peer', code: 1001, reason: 'runtime close' }])
  })

  it('replaces an existing peer when the adapter reuses a peer id', () => {
    const server = createServer<string>()
    const firstSent: string[] = []
    const secondSent: string[] = []

    const first = server.accept({
      id: 'same-peer',
      send: message => firstSent.push(message),
    })
    first.join('room:a')

    server.accept({
      id: 'same-peer',
      send: message => secondSent.push(message),
    })

    const result = server.to('room:a').send('stale-room')
    server.peers.get('same-peer')?.send('direct')

    expect(result).toEqual([])
    expect(firstSent).toEqual([])
    expect(secondSent).toEqual(['direct'])
  })

  it('returns previous peer snapshot when accepting the same id', () => {
    const server = createServer<string, { token: string }>()

    const first = server.peers.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    }, {
      state: { token: 'first-token' },
    }).peer
    first.join('ready')

    const { peer: second, previous } = server.peers.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    expect(previous).toEqual({
      id: 'peer-1',
      state: { token: 'first-token' },
      groups: ['ready'],
      lastSeenAt: expect.any(Number),
      reason: 'replaced',
    })
    expect(second.state).toEqual({ token: 'first-token' })
    expect(second.isIn('ready')).toBe(false)
  })

  it('keeps stale peer handles inert after same-id replacement', () => {
    const server = createServer<string>()
    const firstSend = vi.fn(() => true)
    const firstClose = vi.fn()
    const secondSend = vi.fn(() => true)
    const secondClose = vi.fn()
    const received: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })

    const first = server.peers.accept({
      id: 'peer-1',
      send: firstSend,
      close: firstClose,
    }).peer
    first.join('room')

    const second = server.peers.accept({
      id: 'peer-1',
      send: secondSend,
      close: secondClose,
    }).peer
    second.join('room')

    expect(first.send('stale')).toEqual({ ok: false, reason: 'closed' })
    first.receive('stale')
    first.close()
    first.join('stale-room')
    first.leave('room')

    expect(firstSend).not.toHaveBeenCalled()
    expect(secondClose).not.toHaveBeenCalled()
    expect(received).toEqual([])
    expect(server.peers.get('peer-1')).toBe(second)
    expect(server.to('room').send('fresh')).toEqual([{ peerId: 'peer-1', ok: true }])
  })

  it('keeps stale peer handles inert after replacement', () => {
    const server = createServer<string>()
    const firstSend = vi.fn(() => true)
    const firstClose = vi.fn()
    const secondSend = vi.fn(() => true)
    const secondClose = vi.fn()
    const received: Array<{ peerId: string, message: string }> = []
    server.onMessage(({ peer, message }) => {
      received.push({ peerId: peer.id, message })
    })

    const firstPeer = server.accept({
      id: 'peer-1',
      send: firstSend,
      close: firstClose,
    })
    firstPeer.join('room')

    const secondPeer = server.accept({
      id: 'peer-1',
      send: secondSend,
      close: secondClose,
    })
    secondPeer.join('room')

    const staleSend = firstPeer.send('stale-send')
    firstPeer.receive('stale-receive')
    firstPeer.close()
    firstPeer.join('stale-room')
    firstPeer.leave('room')

    expect(staleSend).toEqual({ ok: false, reason: 'closed' })
    expect(firstSend).not.toHaveBeenCalled()
    expect(secondClose).not.toHaveBeenCalled()
    expect(received).toEqual([])
    expect(server.peers.get('peer-1')).toBe(secondPeer)
    expect(secondPeer.isIn('room')).toBe(true)
    expect(server.to('room').send('current-room')).toEqual([{ peerId: 'peer-1', ok: true }])
    expect(server.to('stale-room').send('stale-room')).toEqual([])
    expect(secondSend).toHaveBeenCalledExactlyOnceWith('current-room')
  })

  it('rebinds repeated CrossWS opens with the same id to the newest raw peer', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS peers are runtime-owned objects. These fakes model only the
    // adapter fields better-ws consumes, keeping the replacement behavior under
    // test without coupling to CrossWS internals.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    server.peers.get('crossws-peer')?.send('reply')

    expect(firstRawPeer.send).not.toHaveBeenCalled()
    expect(secondRawPeer.send).toHaveBeenCalledExactlyOnceWith('reply', { compress: undefined })
  })

  it('ignores stale CrossWS close events after same-id reopen', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS raw peer identity determines which runtime connection owns a
    // close event. These fakes keep the test focused on adapter cache
    // isolation for repeated ids.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    await hooks.close?.(firstRawPeer as unknown as CrossWsPeer, { code: 1000, reason: 'stale' })
    server.peers.get('crossws-peer')?.send('reply')

    expect(server.peers.has('crossws-peer')).toBe(true)
    expect(firstRawPeer.send).not.toHaveBeenCalled()
    expect(secondRawPeer.send).toHaveBeenCalledExactlyOnceWith('reply', { compress: undefined })
  })

  it('ignores late CrossWS messages from a stale raw peer after same-id reopen', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const received: Array<{ peerId: string, message: string }> = []
    server.onMessage(({ peer, message }) => {
      received.push({ peerId: peer.id, message })
    })
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS may deliver late events from a replaced raw connection. The fake
    // peers share an id but have different object identity, which is the
    // adapter-level ownership boundary under test.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    hooks.message?.(firstRawPeer as unknown as CrossWsPeer, { text: () => 'stale-message' } as unknown as CrossWsMessage)

    expect(received).toEqual([])
    expect(server.peers.has('crossws-peer')).toBe(true)
  })

  it('keeps replaced CrossWS raw peers stale after the replacement peer closes', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const received: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    await hooks.close?.(secondRawPeer as unknown as CrossWsPeer, { code: 1000, reason: 'new closed' })
    hooks.message?.(firstRawPeer as unknown as CrossWsPeer, { text: () => 'stale-after-close' } as unknown as CrossWsMessage)

    expect(received).toEqual([])
    expect(server.peers.has('crossws-peer')).toBe(false)
  })

  it('does not expose the current peer to stale CrossWS close hooks after same-id reopen', async () => {
    const server = createServer<string>()
    const close = vi.fn()
    const hooks = toCrossWsHooks(server, { close })
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // A stale close belongs to the replaced raw connection, not the current
    // same-id server peer. The fake peers keep that object identity distinction
    // visible at the CrossWS adapter boundary.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    await hooks.close?.(firstRawPeer as unknown as CrossWsPeer, { code: 1000, reason: 'stale' })

    expect(close).toHaveBeenCalledOnce()
    expect(close.mock.calls[0]?.[0].peer).toBeUndefined()
    expect(server.peers.has('crossws-peer')).toBe(true)
  })

  it('ignores stale CrossWS close after server-side same-id replacement', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // This models a replacement that happens through the server peer manager
    // rather than a second CrossWS open. A late raw close from the adapter cache
    // must not remove the current same-id server peer.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    server.accept({
      id: 'crossws-peer',
      send: message => secondRawPeer.send(message),
      close: (code, reason) => secondRawPeer.close(code, reason),
    })
    await hooks.close?.(firstRawPeer as unknown as CrossWsPeer, { code: 1000, reason: 'stale' })
    server.peers.get('crossws-peer')?.send('reply')

    expect(server.peers.has('crossws-peer')).toBe(true)
    expect(firstRawPeer.send).not.toHaveBeenCalled()
    expect(secondRawPeer.send).toHaveBeenCalledExactlyOnceWith('reply')
  })

  it('ignores stale CrossWS messages after server-side same-id replacement', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const received: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // A late message from a raw peer replaced through the server peer manager
    // must stay stale. Re-accepting it would remove the current same-id peer
    // and route messages through the wrong raw connection.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    server.accept({
      id: 'crossws-peer',
      send: message => secondRawPeer.send(message),
      close: (code, reason) => secondRawPeer.close(code, reason),
    })
    hooks.message?.(firstRawPeer as unknown as CrossWsPeer, { text: () => 'stale-message' } as unknown as CrossWsMessage)
    server.peers.get('crossws-peer')?.send('reply')

    expect(received).toEqual([])
    expect(firstRawPeer.send).not.toHaveBeenCalled()
    expect(secondRawPeer.send).toHaveBeenCalledExactlyOnceWith('reply')
    expect(server.peers.has('crossws-peer')).toBe(true)
  })

  it('keeps server-side replaced CrossWS raw peers stale after the replacement peer closes', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const received: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    const replacement = server.accept({
      id: 'crossws-peer',
      send: message => secondRawPeer.send(message),
      close: (code, reason) => secondRawPeer.close(code, reason),
    })
    replacement.close()
    hooks.message?.(firstRawPeer as unknown as CrossWsPeer, { text: () => 'stale-after-server-close' } as unknown as CrossWsMessage)

    expect(received).toEqual([])
    expect(server.peers.has('crossws-peer')).toBe(false)
  })

  it('refreshes the CrossWS peer cache after server-side peer close', () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const received: string[] = []
    server.onMessage(({ message }) => {
      received.push(message)
    })
    const rawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS messages and peers are runtime-owned objects with a wider public
    // shape than better-ws needs. These fakes model only text reads and peer IO
    // used by this adapter-boundary test.
    // Remove this when CrossWS exposes small public testing fixtures.
    hooks.open?.(rawPeer as unknown as CrossWsPeer)
    server.peers.get('crossws-peer')?.close()
    hooks.message?.(rawPeer as unknown as CrossWsPeer, { text: () => 'fresh-message' } as unknown as CrossWsMessage)
    server.peers.get('crossws-peer')?.send('fresh-send')

    expect(received).toEqual(['fresh-message'])
    expect(rawPeer.close).toHaveBeenCalledOnce()
    expect(rawPeer.send).toHaveBeenCalledExactlyOnceWith('fresh-send', { compress: undefined })
    expect(server.peers.has('crossws-peer')).toBe(true)
  })

  it('refreshes the CrossWS peer cache after server close', async () => {
    const server = createServer<string>()
    const hooks = toCrossWsHooks(server)
    const firstRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }
    const secondRawPeer = {
      id: 'crossws-peer',
      send: vi.fn(),
      close: vi.fn(),
    }

    // NOTICE:
    // CrossWS peers are runtime-owned objects. These fakes model only the
    // adapter fields better-ws consumes, keeping cache refresh behavior under
    // test without depending on CrossWS internals.
    // Remove this when CrossWS exposes a narrow fake peer helper.
    await hooks.open?.(firstRawPeer as unknown as CrossWsPeer)
    server.close()
    await hooks.open?.(secondRawPeer as unknown as CrossWsPeer)
    server.peers.get('crossws-peer')?.send('reply')

    expect(firstRawPeer.close).toHaveBeenCalledOnce()
    expect(firstRawPeer.send).not.toHaveBeenCalled()
    expect(secondRawPeer.send).toHaveBeenCalledExactlyOnceWith('reply', { compress: undefined })
    expect(server.peers.has('crossws-peer')).toBe(true)
  })
})

describe('better-ws client runtime', () => {
  it('applies reconnectRandomFactor to scheduled reconnect delay', async () => {
    vi.useFakeTimers()
    vi.spyOn(Math, 'random').mockReturnValue(1)
    FakeWebSocket.instances.length = 0
    const client = betterWs.createClient({
      url: 'ws://localhost/ws',
      wsConstructor: FakeWebSocket,
      reconnect: {
        retries: 1,
        delay: 1000,
        reconnectRandomFactor: 0.5,
      },
    })

    void client.connect()
    const first = FakeWebSocket.instances.at(-1)!
    first.open()
    first.closeEvent()

    await vi.advanceTimersByTimeAsync(1499)
    expect(FakeWebSocket.instances).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(2)

    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('does not reset reconnect attempt before reconnectMinConnectedDuration', async () => {
    vi.useFakeTimers()
    FakeWebSocket.instances.length = 0
    const client = betterWs.createClient({
      url: 'ws://localhost/ws',
      wsConstructor: FakeWebSocket,
      reconnect: {
        retries: 2,
        delay: attempt => attempt * 100,
        reconnectMinConnectedDuration: 1000,
      },
    })

    void client.connect()
    FakeWebSocket.instances.at(-1)!.open()
    FakeWebSocket.instances.at(-1)!.closeEvent()
    await vi.advanceTimersByTimeAsync(100)
    FakeWebSocket.instances.at(-1)!.open()
    FakeWebSocket.instances.at(-1)!.closeEvent()
    await vi.advanceTimersByTimeAsync(199)
    expect(FakeWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    vi.useRealTimers()
  })
  it('clamps reconnectRandomFactor so positive delays do not collapse to zero', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0)
    const reconnectDelays: number[] = []
    const client = betterWs.createClient({
      url: 'ws://localhost/ws',
      wsConstructor: FakeWebSocket,
      reconnect: {
        retries: 1,
        delay: 1000,
        reconnectRandomFactor: 2,
      },
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        return { cancel: vi.fn(), run }
      },
    })

    void client.connect()
    FakeWebSocket.instances.at(-1)!.open()
    FakeWebSocket.instances.at(-1)!.closeEvent()

    expect(reconnectDelays).toEqual([1])
    vi.restoreAllMocks()
  })

  it('resets reconnect attempt after reconnectMinConnectedDuration', async () => {
    vi.useFakeTimers()
    FakeWebSocket.instances.length = 0
    const client = betterWs.createClient({
      url: 'ws://localhost/ws',
      wsConstructor: FakeWebSocket,
      reconnect: {
        retries: 2,
        delay: attempt => attempt * 100,
        reconnectMinConnectedDuration: 1000,
      },
    })

    void client.connect()
    FakeWebSocket.instances.at(-1)!.open()
    FakeWebSocket.instances.at(-1)!.closeEvent()
    await vi.advanceTimersByTimeAsync(100)
    FakeWebSocket.instances.at(-1)!.open()
    await vi.advanceTimersByTimeAsync(1000)
    FakeWebSocket.instances.at(-1)!.closeEvent()
    await vi.advanceTimersByTimeAsync(99)
    expect(FakeWebSocket.instances).toHaveLength(2)
    await vi.advanceTimersByTimeAsync(1)
    expect(FakeWebSocket.instances).toHaveLength(3)

    vi.useRealTimers()
  })

  it('resets reconnect attempt when prepare fails after reconnectMinConnectedDuration', async () => {
    vi.useFakeTimers()
    const reconnectDelays: number[] = []
    const scheduled: Array<() => void> = []
    const client = betterWs.createClient<string>({
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: vi.fn(),
        }),
      },
      reconnect: {
        retries: 3,
        delay: attempt => attempt * 100,
        reconnectMinConnectedDuration: 1000,
      },
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        scheduled.push(run)
        return { cancel: vi.fn(), run }
      },
      prepare: async ({ attempt }) => {
        if (attempt === 0) {
          throw new Error('initial prepare failed')
        }

        await new Promise(resolve => setTimeout(resolve, 1000))
        throw new Error('retry prepare failed')
      },
    })

    await expect(client.connect()).rejects.toThrow('initial prepare failed')
    expect(reconnectDelays).toEqual([100])

    scheduled[0]?.()
    await vi.advanceTimersByTimeAsync(1000)

    expect(reconnectDelays).toEqual([100, 100])
    vi.useRealTimers()
  })

  it('creates a text client from a native WebSocket constructor', async () => {
    const fake = createFakeSocketClient()
    const { client } = fake
    const received: string[] = []
    client.onMessage(({ message }) => {
      received.push(message)
    })

    const pendingConnect = client.connect()
    const ws = fake.socket
    ws.open()
    await pendingConnect
    client.send('hello')
    ws.receive('from-server')

    expect(client.state).toBe('ready')
    expect(ws.url).toBe('ws://localhost/ws')
    expect(ws.sent).toEqual(['hello'])
    expect(received).toEqual(['from-server'])
  })

  it('moves a url client to ready when no prepare procedure is provided', async () => {
    const fake = createFakeSocketClient()
    const { client } = fake

    const states: string[] = []
    client.onStateChange(({ state }) => states.push(state))

    const connecting = client.connect()
    fake.socket.open()
    await connecting

    expect(client.state).toBe('ready')
    expect(states).toEqual(['connecting', 'open', 'ready'])
  })

  it('rejects a url client open error without scheduling reconnect when reconnect is disabled', async () => {
    const reconnectDelays: number[] = []
    const client = betterWs.createClient({
      url: 'ws://localhost/ws',
      wsConstructor: FakeWebSocket,
      reconnect: false,
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        return { cancel: vi.fn(), run }
      },
    })

    const connecting = client.connect()
    const socket = FakeWebSocket.instances.at(-1)
    socket?.error()
    socket?.closeEvent()

    await expect(connecting).rejects.toThrow('WebSocket connection failed before opening.')

    expect(reconnectDelays).toEqual([])
    expect(client.state).toBe('closed')
  })

  it('schedules reconnect after an initial connector open failure', async () => {
    const reconnectDelays: number[] = []
    const scheduled: Array<() => void> = []
    let attempt = 0
    const client = betterWs.createClient<string>({
      connector: {
        connect() {
          attempt += 1
          if (attempt === 1) {
            throw new Error('server unavailable')
          }

          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
      reconnect: { retries: 1, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        scheduled.push(run)
        return { cancel: vi.fn(), run }
      },
    })

    await expect(client.connect()).rejects.toThrow('server unavailable')

    expect(client.state).toBe('reconnecting')
    expect(reconnectDelays).toEqual([1])

    scheduled[0]?.()
    await Promise.resolve()

    expect(client.state).toBe('ready')
  })

  it('enters ready only after prepare resolves', async () => {
    let serverMessage: ((message: string) => void) | undefined
    const sent: string[] = []
    const states: string[] = []
    const client = betterWs.createClient<string>({
      connector: {
        connect(events) {
          serverMessage = events.message
          return {
            send: (message) => {
              sent.push(message)
              return true
            },
            close: vi.fn(),
          }
        },
      },
      async prepare(ctx) {
        ctx.send('auth')
        await ctx.waitFor(message => message === 'authenticated', { timeout: 100 })
        ctx.send('announce')
        await ctx.waitFor(message => message === 'announced', { timeout: 100 })
      },
    })
    client.onStateChange(({ state }) => states.push(state))

    const connecting = client.connect()
    await Promise.resolve()
    serverMessage?.('authenticated')
    await Promise.resolve()
    serverMessage?.('announced')
    await connecting

    expect(client.state).toBe('ready')
    expect(sent).toEqual(['auth', 'announce'])
    expect(states).toEqual(['connecting', 'open', 'preparing', 'ready'])
  })

  it('rejects prepare when waitFor times out', async () => {
    const closed = vi.fn()
    const client = betterWs.createClient<string>({
      reconnect: false,
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: closed,
        }),
      },
      async prepare(ctx) {
        await ctx.waitFor(message => message === 'never', { timeout: 1 })
      },
    })

    await expect(client.connect()).rejects.toThrow('Timed out waiting for message.')

    expect(client.state).toBe('failed')
    expect(closed).toHaveBeenCalledOnce()
  })

  it('aborts prepare when the client closes while waiting for a message', async () => {
    let prepareError: unknown
    const closed = vi.fn()
    const client = betterWs.createClient<string>({
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: closed,
        }),
      },
      async prepare(ctx) {
        try {
          await ctx.waitFor(message => message === 'ready', { timeout: 100 })
        }
        catch (error) {
          prepareError = error
          throw error
        }
      },
    })

    const connecting = client.connect()
    await Promise.resolve()
    client.close()
    await connecting

    expect(client.state).toBe('closed')
    expect(closed).toHaveBeenCalledOnce()
    expect(prepareError).toBeInstanceOf(Error)
  })

  it('does not enter ready when the transport closes during prepare', async () => {
    let closeTransport: (() => void) | undefined
    let resolvePrepare: (() => void) | undefined
    const states: string[] = []
    const client = betterWs.createClient<string>({
      reconnect: false,
      connector: {
        connect: (events) => {
          closeTransport = () => events.close({ code: 1006, reason: 'lost' })
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
      async prepare() {
        await new Promise<void>((resolve) => {
          resolvePrepare = resolve
        })
      },
    })
    client.onStateChange(({ state }) => states.push(state))

    const connecting = client.connect()
    await Promise.resolve()
    closeTransport?.()
    resolvePrepare?.()
    await connecting

    expect(client.state).toBe('closed')
    expect(states).not.toContain('ready')
  })

  it('aborts stale prepare when a newer connect starts', async () => {
    const closed = [vi.fn(), vi.fn()]
    const prepareErrors: unknown[] = []
    const prepareSignals: AbortSignal[] = []
    let connectCount = 0
    let serverMessage: ((message: string) => void) | undefined
    const client = betterWs.createClient<string>({
      connector: {
        connect(events) {
          const connectionIndex = connectCount++
          serverMessage = events.message
          return {
            send: vi.fn(() => true),
            close: closed[connectionIndex],
          }
        },
      },
      async prepare(ctx) {
        prepareSignals.push(ctx.signal)
        try {
          await ctx.waitFor(message => message === `ready:${prepareSignals.length}`, { timeout: 100 })
        }
        catch (error) {
          prepareErrors.push(error)
          throw error
        }
      },
    })

    const firstConnect = client.connect()
    await Promise.resolve()
    const secondConnect = client.connect()
    await Promise.resolve()
    serverMessage?.('ready:2')
    await Promise.all([firstConnect, secondConnect])

    expect(prepareSignals[0]?.aborted).toBe(true)
    expect(prepareErrors[0]).toBeInstanceOf(Error)
    expect(client.state).toBe('ready')
    expect(closed[0]).toHaveBeenCalledOnce()
  })

  it('keeps stale prepare waitFor bound to its aborted prepare context', async () => {
    const closed = [vi.fn(), vi.fn()]
    let connectCount = 0
    let serverMessage: ((message: string) => void) | undefined
    let firstWaitFor: ((message: string) => Promise<string>) | undefined
    let firstWaitError: unknown
    let firstWaitResult: string | undefined
    const client = betterWs.createClient<string>({
      connector: {
        connect(events) {
          const connectionIndex = connectCount++
          serverMessage = events.message
          return {
            send: vi.fn(() => true),
            close: closed[connectionIndex],
          }
        },
      },
      async prepare(ctx) {
        if (!firstWaitFor) {
          firstWaitFor = (expected: string) => ctx.waitFor(message => message === expected, { timeout: 100 })
          return
        }

        await ctx.waitFor(message => message === 'second-ready', { timeout: 100 })
      },
    })

    const firstConnect = client.connect()
    await Promise.resolve()
    const secondConnect = client.connect()
    await Promise.resolve()
    const staleWait = firstWaitFor?.('second-ready')
      .then((message) => {
        firstWaitResult = message
      })
      .catch((error: unknown) => {
        firstWaitError = error
      })
    serverMessage?.('second-ready')
    await secondConnect
    await staleWait
    await firstConnect

    expect(client.state).toBe('ready')
    expect(firstWaitResult).toBeUndefined()
    expect(firstWaitError).toBeInstanceOf(Error)
    expect((firstWaitError as Error).message).toBe('Wait for message aborted.')
    expect(closed[0]).toHaveBeenCalledOnce()
  })

  it('does not stay preparing when prepare fails and reconnect is enabled', async () => {
    const reconnects: number[] = []
    const closed = vi.fn()
    const client = betterWs.createClient<string>({
      reconnect: { retries: 1, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnects.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: closed,
        }),
      },
      async prepare() {
        throw new Error('prepare failed')
      },
    })

    await expect(client.connect()).rejects.toThrow('prepare failed')

    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([1])
    expect(closed).toHaveBeenCalledOnce()
  })

  it('passes reconnect attempt metadata to prepare after a scheduled retry', async () => {
    let scheduledRun: (() => void) | undefined
    const prepareAttempts: Array<{ attempt: number, reconnecting: boolean }> = []
    const client = betterWs.createClient<string>({
      reconnect: { retries: 1, delay: attempt => attempt },
      schedule: (_delay, run) => {
        scheduledRun = run
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: vi.fn(),
        }),
      },
      async prepare(ctx) {
        prepareAttempts.push({ attempt: ctx.attempt, reconnecting: ctx.reconnecting })
        if (prepareAttempts.length === 1) {
          throw new Error('prepare failed')
        }
      },
    })

    await expect(client.connect()).rejects.toThrow('prepare failed')
    scheduledRun?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(client.state).toBe('ready')
    expect(prepareAttempts).toEqual([
      { attempt: 0, reconnecting: false },
      { attempt: 1, reconnecting: true },
    ])
  })

  it('does not schedule duplicate reconnect when failed prepare connection later closes', async () => {
    const reconnects: number[] = []
    const closed = vi.fn()
    let closeTransport: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: { retries: 2, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnects.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: (events) => {
          closeTransport = () => events.close({ code: 1006, reason: 'late close' })
          return {
            send: vi.fn(() => true),
            close: closed,
          }
        },
      },
      async prepare() {
        throw new Error('prepare failed')
      },
    })

    await expect(client.connect()).rejects.toThrow('prepare failed')
    closeTransport?.()

    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([1])
    expect(closed).toHaveBeenCalledOnce()
  })

  it('blocks normal send before ready', async () => {
    const sent: string[] = []
    let resolveConnection: ((connection: { send: (message: string) => void, close: () => void }) => void) | undefined
    const client = betterWs.createClient<string>({
      connector: {
        connect: () => new Promise((resolve) => {
          resolveConnection = resolve
        }),
      },
    })

    const connecting = client.connect()

    expect(client.send('before-open')).toEqual({ ok: false, reason: 'closed' })

    resolveConnection?.({
      send: message => sent.push(message),
      close: vi.fn(),
    })
    await connecting

    expect(client.send('ready')).toEqual({ ok: true })
    expect(sent).toEqual(['ready'])
  })

  it('allows send during open before ready when requireReady is false', async () => {
    const sent: string[] = []
    let resolveConnection: ((connection: { send: (message: string) => void, close: () => void }) => void) | undefined
    const client = betterWs.createClient<string>({
      connector: {
        connect: () => new Promise((resolve) => {
          resolveConnection = resolve
        }),
      },
    })

    client.onStateChange(({ state }) => {
      if (state === 'open') {
        expect(client.send('before-ready', { requireReady: false })).toEqual({ ok: true })
      }
    })

    const connecting = client.connect()
    resolveConnection?.({
      send: message => sent.push(message),
      close: vi.fn(),
    })
    await connecting

    expect(client.state).toBe('ready')
    expect(sent).toEqual(['before-ready'])
  })

  it('connects through an adapter, dispatches messages, and reports send results', async () => {
    const sent: string[] = []
    let adapterMessage: ((message: string) => void) | undefined
    const client = betterWs.createClient<string>({
      connector: {
        connect: async ({ message }) => {
          adapterMessage = message
          return {
            send: (nextMessage) => {
              sent.push(nextMessage)
              return true
            },
            close: vi.fn(),
          }
        },
      },
    })
    const received: string[] = []
    client.onMessage(({ message }) => {
      received.push(message)
    })

    await client.connect()
    const result = client.send('hello')
    adapterMessage?.('from-server')

    expect(client.state).toBe('ready')
    expect(result).toEqual({ ok: true })
    expect(sent).toEqual(['hello'])
    expect(received).toEqual(['from-server'])
  })

  it('sends message heartbeat and keeps the connection alive after a response', async () => {
    const sent: string[] = []
    let serverMessage: ((message: string) => void) | undefined
    const cancelHeartbeatTimeout = vi.fn()
    const scheduled: Array<{ delay: number, run: () => void }> = []
    const client = betterWs.createClient<string>({
      heartbeat: {
        mode: 'message',
        interval: 10,
        timeout: 20,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (_delay, run) => {
        scheduled.push({ delay: _delay, run })
        return { cancel: scheduled.length === 2 ? cancelHeartbeatTimeout : vi.fn() }
      },
      connector: {
        connect: (events) => {
          serverMessage = events.message
          return {
            send: (message) => {
              sent.push(message)
              return true
            },
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    scheduled[0]?.run()
    serverMessage?.('pong')

    expect(sent).toEqual(['ping'])
    expect(cancelHeartbeatTimeout).toHaveBeenCalledOnce()
    expect(client.state).toBe('ready')
  })

  it('does not let strict non-response messages defer heartbeat timeout', async () => {
    const scheduled: Array<{ delay: number, run: () => void, cancel: ReturnType<typeof vi.fn> }> = []
    const reconnectErrors: unknown[] = []
    let serverMessage: ((message: string) => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 1,
        delay: (_attempt, error) => {
          reconnectErrors.push(error)
          return 10
        },
      },
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 5,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (delay, run) => {
        const task = { delay, run, cancel: vi.fn() }
        scheduled.push(task)
        return task
      },
      connector: {
        connect: (events) => {
          serverMessage = events.message
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    scheduled[0]?.run()
    serverMessage?.('not-pong')

    expect(scheduled).toHaveLength(2)
    expect(scheduled[1]?.delay).toBe(5)
    expect(scheduled[1]?.cancel).not.toHaveBeenCalled()

    scheduled[1]?.run()

    expect(client.state).toBe('reconnecting')
    expect(reconnectErrors).toHaveLength(1)
    expect(reconnectErrors[0]).toBeInstanceOf(Error)
    expect((reconnectErrors[0] as Error).message).toBe('Heartbeat timed out after 5ms.')
  })

  it('clears pending heartbeat timeout on any inbound message when no response predicate is provided', async () => {
    const cancelHeartbeatTimeout = vi.fn()
    const scheduled: Array<{ delay: number, run: () => void }> = []
    let serverMessage: ((message: string) => void) | undefined
    const client = betterWs.createClient<string>({
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 5,
        message: 'ping',
      },
      schedule: (delay, run) => {
        scheduled.push({ delay, run })
        return { cancel: scheduled.length === 2 ? cancelHeartbeatTimeout : vi.fn() }
      },
      connector: {
        connect: (events) => {
          serverMessage = events.message
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    scheduled[0]?.run()
    serverMessage?.('any-message')

    expect(cancelHeartbeatTimeout).toHaveBeenCalledOnce()
    expect(scheduled).toHaveLength(3)
    expect(scheduled[2]?.delay).toBe(1)
  })

  it('reconnects when heartbeat response times out', async () => {
    const scheduled: Array<{ label: string, delay: number, run: () => void }> = []
    const closed = vi.fn()
    const client = betterWs.createClient<string>({
      reconnect: { retries: 1, delay: 5 },
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 1,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (delay, run) => {
        const label = scheduled.length === 0
          ? 'heartbeat interval'
          : scheduled.length === 1
            ? 'heartbeat timeout'
            : 'reconnect delay'
        scheduled.push({ label, delay, run })
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: closed,
        }),
      },
    })

    await client.connect()
    scheduled.find(task => task.label === 'heartbeat interval')?.run()
    scheduled.find(task => task.label === 'heartbeat timeout')?.run()

    expect(closed).toHaveBeenCalledOnce()
    expect(client.state).toBe('reconnecting')
    expect(scheduled).toMatchObject([
      { label: 'heartbeat interval', delay: 1 },
      { label: 'heartbeat timeout', delay: 1 },
      { label: 'reconnect delay', delay: 5 },
    ])
  })

  it('schedules one reconnect when heartbeat timeout close emits synchronously', async () => {
    const reconnects: number[] = []
    const scheduled: Array<{ label: string, run: () => void }> = []
    const client = betterWs.createClient<string>({
      reconnect: { retries: 2, delay: attempt => attempt },
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 1,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (delay, run) => {
        if (scheduled.length < 2) {
          scheduled.push({
            label: scheduled.length === 0 ? 'heartbeat interval' : 'heartbeat timeout',
            run,
          })
        }
        else {
          reconnects.push(delay)
        }
        return { cancel: vi.fn() }
      },
      connector: {
        connect: ({ close }) => ({
          send: vi.fn(() => true),
          close: () => close({ code: 1006, reason: 'heartbeat timeout' }),
        }),
      },
    })

    await client.connect()
    scheduled.find(task => task.label === 'heartbeat interval')?.run()
    scheduled.find(task => task.label === 'heartbeat timeout')?.run()

    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([1])
  })

  it('uses native ping for automatic heartbeat when the connection exposes ping', async () => {
    const ping = vi.fn(() => true)
    let scheduled: (() => void) | undefined
    const client = betterWs.createClient<string>({
      heartbeat: {
        mode: 'auto',
        interval: 10,
      },
      schedule: (_delay, run) => {
        scheduled = run
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          ping,
          close: vi.fn(),
        }),
      },
    })

    await client.connect()
    scheduled?.()

    expect(ping).toHaveBeenCalledOnce()
    expect(client.state).toBe('ready')
  })

  it('uses message heartbeat in auto mode when native ping is unavailable and message exists', async () => {
    const sent: string[] = []
    let scheduled: (() => void) | undefined
    const client = betterWs.createClient<string>({
      heartbeat: {
        mode: 'auto',
        interval: 10,
        message: 'ping',
      },
      schedule: (_delay, run) => {
        scheduled = run
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: (message) => {
            sent.push(message)
            return true
          },
          close: vi.fn(),
        }),
      },
    })

    await client.connect()
    scheduled?.()

    expect(sent).toEqual(['ping'])
    expect(client.state).toBe('ready')
  })

  it('fails coherently when native heartbeat has no ping support', async () => {
    const reconnectErrors: unknown[] = []
    let scheduled: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 1,
        delay: (_attempt, error) => {
          reconnectErrors.push(error)
          return 10
        },
      },
      heartbeat: {
        mode: 'native',
        interval: 1,
      },
      schedule: (_delay, run) => {
        scheduled = run
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: vi.fn(),
        }),
      },
    })

    await client.connect()
    scheduled?.()

    expect(client.state).toBe('reconnecting')
    expect(reconnectErrors).toHaveLength(1)
    expect((reconnectErrors[0] as Error).message).toBe('Native heartbeat requires connection.ping().')
  })

  it('fails coherently when message heartbeat has no configured message', async () => {
    const reconnectErrors: unknown[] = []
    let scheduled: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 1,
        delay: (_attempt, error) => {
          reconnectErrors.push(error)
          return 10
        },
      },
      heartbeat: {
        mode: 'message',
        interval: 1,
      },
      schedule: (_delay, run) => {
        scheduled = run
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: vi.fn(),
        }),
      },
    })

    await client.connect()
    scheduled?.()

    expect(client.state).toBe('reconnecting')
    expect(reconnectErrors).toHaveLength(1)
    expect((reconnectErrors[0] as Error).message).toBe('Message heartbeat requires heartbeat.message.')
  })

  it('cancels heartbeat tasks on manual close', async () => {
    const cancelHeartbeatInterval = vi.fn()
    const cancelHeartbeatTimeout = vi.fn()
    let scheduledCount = 0
    const closed = vi.fn()
    const client = betterWs.createClient<string>({
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 1,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (_delay, run) => {
        scheduledCount += 1
        return {
          cancel: scheduledCount === 1 ? cancelHeartbeatInterval : cancelHeartbeatTimeout,
          run,
        }
      },
      connector: {
        connect: () => ({
          send: vi.fn(() => true),
          close: closed,
        }),
      },
    })

    await client.connect()
    client.close()

    expect(closed).toHaveBeenCalledOnce()
    expect(cancelHeartbeatInterval).toHaveBeenCalledOnce()
    expect(cancelHeartbeatTimeout).not.toHaveBeenCalled()
    expect(client.state).toBe('closed')
  })

  it('ignores stale heartbeat timeouts after a newer connection becomes active', async () => {
    const scheduled: Array<{ delay: number, run: () => void }> = []
    const closed = [vi.fn(), vi.fn()]
    let connectCount = 0
    const client = betterWs.createClient<string>({
      reconnect: { retries: 1, delay: 5 },
      heartbeat: {
        mode: 'message',
        interval: 1,
        timeout: 1,
        message: 'ping',
        isResponse: message => message === 'pong',
      },
      schedule: (delay, run) => {
        scheduled.push({ delay, run })
        return { cancel: vi.fn() }
      },
      connector: {
        connect: () => {
          const connectionIndex = connectCount++
          return {
            send: vi.fn(() => true),
            close: closed[connectionIndex],
          }
        },
      },
    })

    await client.connect()
    scheduled[0]?.run()
    await client.connect()
    scheduled[1]?.run()

    expect(closed[0]).toHaveBeenCalledOnce()
    expect(closed[1]).not.toHaveBeenCalled()
    expect(client.state).toBe('ready')
    expect(scheduled).toHaveLength(3)
  })

  it('schedules reconnect after unexpected close', async () => {
    const reconnects: number[] = []
    let closeHandler: ((details?: { code?: number, reason?: string }) => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: { retries: 2, delay: attempt => attempt * 10 },
      schedule: (delay, run) => {
        reconnects.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: async ({ close }) => {
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.({ code: 1006, reason: 'network' })

    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([10])
  })

  it('closes the active connection when a post-open adapter error schedules reconnect', async () => {
    const reconnects: number[] = []
    let emitError: ((error: unknown) => void) | undefined
    const close = vi.fn()
    const client = betterWs.createClient<string>({
      connector: {
        connect(events) {
          emitError = events.error
          return {
            send: vi.fn(() => true),
            close,
          }
        },
      },
      reconnect: { retries: 1, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnects.push(delay)
        return { cancel: vi.fn(), run }
      },
    })

    await client.connect()
    emitError?.(new Error('invalid payload'))

    expect(close).toHaveBeenCalledOnce()
    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([1])
  })

  it('reconnects by default after an unexpected close', async () => {
    const reconnectDelays: number[] = []
    let closeHandler: (() => void) | undefined
    let connects = 0
    const client = betterWs.createClient<string>({
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: ({ close }) => {
          connects += 1
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.()

    expect(client.state).toBe('reconnecting')
    expect(connects).toBe(1)
    expect(reconnectDelays).toEqual([1000])
  })

  it('calls onFailed when retry predicate stops reconnecting', async () => {
    const onFailed = vi.fn()
    let closeHandler: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: attempt => attempt < 1,
        delay: 1,
        onFailed,
      },
      connector: {
        connect: ({ close }) => {
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.()
    await Promise.resolve()

    expect(client.state).toBe('failed')
    expect(onFailed).toHaveBeenCalledOnce()
  })

  it('continues reconnect policy when an automatic reconnect fails to open', async () => {
    const reconnectDelays: number[] = []
    const scheduledRuns: Array<() => void> = []
    let closeHandler: (() => void) | undefined
    let connects = 0
    const client = betterWs.createClient<string>({
      reconnect: { retries: 2, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        scheduledRuns.push(run)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: ({ close }) => {
          connects += 1
          if (connects === 2) {
            throw new Error('automatic reconnect failed')
          }

          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.()
    scheduledRuns[0]?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(connects).toBe(2)
    expect(client.state).toBe('reconnecting')
    expect(reconnectDelays).toEqual([1, 2])
  })

  it('keeps automatic reconnect dialing in reconnecting state', async () => {
    const states: string[] = []
    const scheduledRuns: Array<() => void> = []
    let closeHandler: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: { retries: 1, delay: 1 },
      schedule: (_delay, run) => {
        scheduledRuns.push(run)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: ({ close }) => {
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })
    client.onStateChange(({ state }) => states.push(state))

    await client.connect()

    expect(states).toContain('connecting')

    states.length = 0
    closeHandler?.()
    scheduledRuns[0]?.()
    await Promise.resolve()
    await Promise.resolve()

    expect(states).not.toContain('connecting')
    expect(states).toEqual(['reconnecting', 'open', 'ready'])
    expect(client.state).toBe('ready')
  })

  it('resets close error after a successful reconnect', async () => {
    const firstError = new Error('first connection failed')
    const reconnectErrors: unknown[] = []
    const scheduledRuns: Array<() => void> = []
    const closeHandlers: Array<() => void> = []
    const errorHandlers: Array<(error: unknown) => void> = []
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 2,
        delay: (_attempt, error) => {
          reconnectErrors.push(error)
          return 1
        },
      },
      schedule: (_delay, run) => {
        scheduledRuns.push(run)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: ({ close, error }) => {
          closeHandlers.push(close)
          errorHandlers.push(error)
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    errorHandlers[0]?.(firstError)
    scheduledRuns[0]?.()
    await Promise.resolve()
    await Promise.resolve()
    closeHandlers[1]?.()

    expect(client.state).toBe('reconnecting')
    expect(reconnectErrors).toHaveLength(2)
    expect(reconnectErrors[0]).toBe(firstError)
    expect(reconnectErrors[1]).toBeInstanceOf(Error)
    expect((reconnectErrors[1] as Error).message).toBe('Connection closed')
    expect(reconnectErrors[1]).not.toBe(firstError)
  })

  it('fails coherently when retry predicate throws', async () => {
    const policyError = new Error('retry predicate failed')
    const onFailed = vi.fn()
    let closeHandler: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: () => {
          throw policyError
        },
        delay: 1,
        onFailed,
      },
      connector: {
        connect: ({ close }) => {
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.()

    expect(client.state).toBe('failed')
    expect(onFailed).toHaveBeenCalledOnce()
    expect(onFailed).toHaveBeenCalledWith(policyError)
  })

  it('fails coherently when reconnect delay resolver throws', async () => {
    const policyError = new Error('delay resolver failed')
    const onFailed = vi.fn()
    let closeHandler: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 1,
        delay: () => {
          throw policyError
        },
        onFailed,
      },
      connector: {
        connect: ({ close }) => {
          closeHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    await client.connect()
    closeHandler?.()

    expect(client.state).toBe('failed')
    expect(onFailed).toHaveBeenCalledOnce()
    expect(onFailed).toHaveBeenCalledWith(policyError)
  })

  it('ignores stale error events when resolving the current reconnect delay', async () => {
    const staleError = new Error('stale connection failed')
    const reconnectErrors: unknown[] = []
    const connectionErrors: Array<(error: unknown) => void> = []
    let currentCloseHandler: (() => void) | undefined
    const client = betterWs.createClient<string>({
      reconnect: {
        retries: 1,
        delay: (_attempt, error) => {
          reconnectErrors.push(error)
          return 1
        },
      },
      schedule: (_delay, run) => ({ cancel: vi.fn(), run }),
      connector: {
        connect: ({ close, error }) => {
          connectionErrors.push(error)
          currentCloseHandler = close
          return {
            send: vi.fn(() => true),
            close: vi.fn(),
          }
        },
      },
    })

    // ROOT CAUSE:
    //
    // Stale error events used to assign `lastCloseError` before the epoch
    // guard in close handling could reject them. A later current close then
    // scheduled reconnect using the stale connection's error.
    await client.connect()
    await client.connect()
    connectionErrors[0]?.(staleError)
    currentCloseHandler?.()

    expect(client.state).toBe('reconnecting')
    expect(reconnectErrors).toHaveLength(1)
    expect(reconnectErrors[0]).toBeInstanceOf(Error)
    expect((reconnectErrors[0] as Error).message).toBe('Connection closed')
  })

  it('schedules one reconnect when prepare failure close emits synchronously', async () => {
    const reconnects: number[] = []
    const client = betterWs.createClient<string>({
      reconnect: { retries: 2, delay: attempt => attempt },
      schedule: (delay, run) => {
        reconnects.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: ({ close }) => ({
          send: vi.fn(() => true),
          close: () => close({ code: 1006, reason: 'prepare close' }),
        }),
      },
      async prepare() {
        throw new Error('prepare failed')
      },
    })

    // ROOT CAUSE:
    //
    // Prepare failure used to call the adapter close hook before invalidating
    // the connection epoch. If that close emitted synchronously, both the close
    // path and prepare catch scheduled reconnect.
    await expect(client.connect()).rejects.toThrow('prepare failed')

    expect(client.state).toBe('reconnecting')
    expect(reconnects).toEqual([1])
  })

  it('returns to closed when a connector fails to open with reconnect disabled', async () => {
    const reconnectDelays: number[] = []
    const client = betterWs.createClient<string>({
      reconnect: false,
      schedule: (delay, run) => {
        reconnectDelays.push(delay)
        return { cancel: vi.fn(), run }
      },
      connector: {
        connect: async () => {
          throw new Error('connect failed')
        },
      },
    })

    await expect(client.connect()).rejects.toThrow('connect failed')

    expect(client.state).toBe('closed')
    expect(reconnectDelays).toEqual([])
  })

  it('keeps a client closed when a pending connect resolves after manual close', async () => {
    let resolveConnection: ((connection: { send: (message: string) => boolean, close: () => void }) => void) | undefined
    const connection = {
      send: vi.fn(() => true),
      close: vi.fn(),
    }
    const client = betterWs.createClient<string>({
      connector: {
        connect: () => new Promise((resolve) => {
          resolveConnection = resolve
        }),
      },
    })

    const pendingConnect = client.connect()
    client.close()
    resolveConnection?.(connection)
    await pendingConnect

    expect(client.state).toBe('closed')
    expect(client.send('late')).toEqual({ ok: false, reason: 'closed' })
    expect(connection.close).toHaveBeenCalledOnce()
  })
})

describe('better-ws server control messages', () => {
  it('routes heartbeat control messages to onPing and onPong without business onMessage', () => {
    type Message = { type: 'ping' } | { type: 'pong' } | { type: 'data', value: string }
    const server = createServer<Message>({
      heartbeat: {
        message: () => ({ type: 'ping' }),
        isPing: message => message.type === 'ping',
        isPong: message => message.type === 'pong',
      },
    })
    const messages: Message[] = []
    const pings: string[] = []
    const pongs: string[] = []
    server.onMessage(({ message }) => {
      messages.push(message)
    })
    server.onPing(({ peer }) => {
      pings.push(peer.id)
    })
    server.onPong(({ peer }) => {
      pongs.push(peer.id)
    })

    const peer = server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }).peer
    peer.receive({ type: 'ping' })
    peer.receive({ type: 'pong' })
    peer.receive({ type: 'data', value: 'hello' })

    expect(pings).toEqual(['peer-1'])
    expect(pongs).toEqual(['peer-1'])
    expect(messages).toEqual([{ type: 'data', value: 'hello' }])
  })
})

describe('better-ws server lifecycle procedures', () => {
  it('passes peers and previous snapshot to peer open handlers', () => {
    const server = createServer<string, { ready: boolean }>()
    const opens: Array<{ id: string, previousState?: { ready: boolean }, peerCount: number }> = []

    server.onPeerOpen(({ peer, previous, peers }) => {
      opens.push({
        id: peer.id,
        previousState: previous?.state,
        peerCount: peers.list().length,
      })
    })

    server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }, { state: { ready: false } })
    server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) })

    expect(opens).toEqual([
      { id: 'peer-1', previousState: undefined, peerCount: 1 },
      { id: 'peer-1', previousState: { ready: false }, peerCount: 1 },
    ])
  })

  it('emits peer close only when a peer is actually removed', () => {
    const server = createServer<string>()
    const closed: string[] = []
    server.onPeerClose(({ peerId }) => {
      closed.push(peerId)
    })

    server.peers.remove('missing')
    const peer = server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }).peer
    server.peers.remove(peer.id)
    server.peers.remove(peer.id)

    expect(closed).toEqual(['peer-1'])
  })

  it('emits peer close for direct close, manager close, liveness, and replacement', () => {
    const server = createServer<string>({
      peers: {
        unhealthyTimeout: 10,
        closeTimeout: 10,
      },
      heartbeat: {
        timeout: 10,
      },
    })
    const closed: Array<{ peerId: string, code?: number, reason?: string }> = []
    server.onPeerClose(({ peerId, details }) => {
      closed.push({ peerId, code: details?.code, reason: details?.reason })
    })

    const direct = server.peers.accept({ id: 'direct', send: vi.fn(() => true), close: vi.fn() }).peer
    direct.close(4000, 'direct close')

    server.peers.accept({ id: 'manager', send: vi.fn(() => true), close: vi.fn() })
    server.peers.close('manager', 4001, 'manager close')

    server.peers.accept({ id: 'liveness', send: vi.fn(() => true), close: vi.fn() })
    server.checkLiveness(Date.now() + 10)

    server.peers.accept({ id: 'replace', send: vi.fn(() => true), close: vi.fn() })
    server.peers.accept({ id: 'replace', send: vi.fn(() => true), close: vi.fn() })

    expect(closed).toEqual([
      { peerId: 'direct', code: 4000, reason: 'direct close' },
      { peerId: 'manager', code: 4001, reason: 'manager close' },
      { peerId: 'liveness', code: undefined, reason: undefined },
      { peerId: 'replace', code: undefined, reason: undefined },
    ])
  })

  it('rejects waitFor on timeout and external abort', async () => {
    const timeoutServer = createServer<string>()
    const timeoutFailures: string[] = []
    timeoutServer.onPeerOpen(async (event) => {
      try {
        await event.procedure(async (ctx) => {
          await ctx.waitFor(message => message === 'never', { timeout: 1 })
        })
      }
      catch (error) {
        timeoutFailures.push(errorText(error))
      }
    })
    timeoutServer.peers.accept({ id: 'timeout', send: vi.fn(() => true) })

    await vi.waitFor(() => {
      expect(timeoutFailures).toEqual(['Procedure waitFor timed out.'])
    })

    const abortServer = createServer<string>()
    const controller = new AbortController()
    const abortFailures: string[] = []
    abortServer.onPeerOpen(async (event) => {
      try {
        await event.procedure(async (ctx) => {
          await ctx.waitFor(message => message === 'never', { signal: controller.signal })
        })
      }
      catch (error) {
        abortFailures.push(errorText(error))
      }
    })
    abortServer.peers.accept({ id: 'abort', send: vi.fn(() => true) })
    controller.abort()

    await vi.waitFor(() => {
      expect(abortFailures).toEqual(['Procedure aborted.'])
    })
  })

  it('does not let a replaced peer procedure receive the next peer messages', async () => {
    const server = createServer<string>()
    const ready: string[] = []
    const failures: string[] = []

    server.onPeerOpen(async (event) => {
      try {
        await event.procedure(async (ctx) => {
          const message = await ctx.waitFor(message => message === 'auth-ok', { timeout: 5 })
          ready.push(`${ctx.peer.id}:${message}`)
        })
      }
      catch (error) {
        failures.push(errorText(error))
      }
    })

    server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) })
    const next = server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }).peer
    next.receive('auth-ok')

    await vi.waitFor(() => {
      expect(ready).toEqual(['peer-1:auth-ok'])
      expect(failures).toEqual(['Procedure aborted.'])
    })
  })

  it('cleans up waitFor when the predicate throws', async () => {
    const server = createServer<string>()
    const failures: string[] = []

    server.onPeerOpen(async (event) => {
      try {
        await event.procedure(async (ctx) => {
          await ctx.waitFor(() => {
            throw new Error('predicate failed')
          })
        })
      }
      catch (error) {
        failures.push(errorText(error))
      }
    })

    const peer = server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }).peer
    peer.receive('first')
    peer.receive('second')

    await vi.waitFor(() => {
      expect(failures).toEqual(['predicate failed'])
    })
  })

  it('runs peer open procedure with waitFor and cleanup', async () => {
    const server = createServer<string>()
    const ready: string[] = []

    server.onPeerOpen(async (event) => {
      await event.procedure(async (ctx) => {
        const message = await ctx.waitFor(message => message === 'auth-ok', { timeout: 50 })
        ready.push(message)
      })
    })

    const peer = server.peers.accept({ id: 'peer-1', send: vi.fn(() => true) }).peer
    peer.receive('auth-ok')

    await vi.waitFor(() => {
      expect(ready).toEqual(['auth-ok'])
    })
  })
})

describe('better-ws integrated runtime', () => {
  it('connects a client connector to a server peer and exchanges messages both ways', async () => {
    const server = createServer<string>()
    const clientReceived: string[] = []
    const serverReceived: Array<{ peerId: string, message: string }> = []
    let serverPeerId: string | undefined

    server.onMessage(({ peer, message }) => {
      serverReceived.push({ peerId: peer.id, message })
      peer.send(`ack:${message}`)
    })

    const client = betterWs.createClient<string>({
      connector: {
        connect: ({ message }) => {
          const peer = server.accept({
            id: 'client-1',
            send: (serverMessage) => {
              message(serverMessage)
              return true
            },
          })
          serverPeerId = peer.id

          return {
            send: clientMessage => peer.receive(clientMessage),
            close: () => server.remove(peer.id),
          }
        },
      },
    })
    client.onMessage(({ message }) => {
      clientReceived.push(message)
    })

    await client.connect()
    const sendResult = client.send('hello')

    expect(sendResult).toEqual({ ok: true })
    expect(serverPeerId).toBe('client-1')
    expect(server.peers.has('client-1')).toBe(true)
    expect(serverReceived).toEqual([{ peerId: 'client-1', message: 'hello' }])
    expect(clientReceived).toEqual(['ack:hello'])

    client.close()

    expect(server.peers.has('client-1')).toBe(false)
  })
})
