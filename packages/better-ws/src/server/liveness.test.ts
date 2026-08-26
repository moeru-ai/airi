import { describe, expect, it, vi } from 'vitest'

import { createServer } from '.'

describe('better-ws server liveness', () => {
  it('marks a peer unhealthy and then removes it after peer health timeouts', () => {
    const health: Array<{ healthy: boolean, peerId: string }> = []
    const closed = vi.fn()
    const server = createServer<string>({
      heartbeat: {
        interval: 1,
        isResponse: message => message === 'pong',
        message: () => 'ping',
        timeout: 10,
      },
      peers: {
        closeTimeout: 20,
        unhealthyTimeout: 10,
      },
    })
    server.onPeerHealthChange((event) => {
      health.push({ healthy: event.healthy, peerId: event.peer.id })
    })

    const peer = server.peers.accept({
      close: closed,
      id: 'peer-1',
      send: vi.fn(() => true),
    }).peer
    const now = Date.now()

    server.checkLiveness(now + 11)
    server.checkLiveness(now + 21)

    expect(peer.id).toBe('peer-1')
    expect(health).toEqual([{ healthy: false, peerId: 'peer-1' }])
    expect(closed).toHaveBeenCalledOnce()
    expect(server.peers.has('peer-1')).toBe(false)
  })

  it('marks an unhealthy peer healthy after inbound traffic', () => {
    const health: boolean[] = []
    const server = createServer<string>({
      heartbeat: {
        timeout: 10,
      },
      peers: {
        closeTimeout: 30,
        unhealthyTimeout: 10,
      },
    })
    const peer = server.peers.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    }).peer
    server.onPeerHealthChange((event) => {
      health.push(event.healthy)
    })

    server.checkLiveness(Date.now() + 11)
    peer.receive('hello')

    expect(health).toEqual([false, true])
  })

  it('checks peer liveness when peer timeouts are configured and heartbeat transport is disabled', () => {
    const closed = vi.fn()
    const server = createServer<string>({
      heartbeat: false,
      peers: {
        closeTimeout: 20,
        unhealthyTimeout: 10,
      },
    })
    server.peers.accept({
      close: closed,
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    server.checkLiveness(Date.now() + 20)

    expect(closed).toHaveBeenCalledOnce()
    expect(server.peers.has('peer-1')).toBe(false)
  })

  it('does not check peer liveness when heartbeat is disabled', () => {
    const closed = vi.fn()
    const server = createServer<string>()
    const peer = server.accept({
      close: closed,
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    server.checkLiveness(Date.now() + 120_000)

    expect(peer.id).toBe('peer-1')
    expect(closed).not.toHaveBeenCalled()
    expect(server.peers.has('peer-1')).toBe(true)
  })

  it('removes replaced peer health while keeping group membership on the new peer', () => {
    const health: boolean[] = []
    const server = createServer<string>({
      heartbeat: {
        timeout: 10,
      },
      peers: {
        closeTimeout: 30,
        unhealthyTimeout: 10,
      },
    })
    const firstPeer = server.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    })
    firstPeer.join('room')
    server.onPeerHealthChange((event) => {
      health.push(event.healthy)
    })

    server.checkLiveness(Date.now() + 11)
    const secondPeer = server.accept({
      id: 'peer-1',
      send: vi.fn(() => true),
    })
    secondPeer.join('room')
    secondPeer.receive('hello')

    expect(health).toEqual([false])
    expect(secondPeer.isIn('room')).toBe(true)
    expect(server.to('room').send('hello')).toEqual([
      { ok: true, peerId: 'peer-1' },
    ])
  })

  it('emits silent duration when marking a peer unhealthy before close timeout', () => {
    const health: Array<{ healthy: boolean, silentFor: number }> = []
    const closed = vi.fn()
    const server = createServer<string>({
      heartbeat: {
        timeout: 10,
      },
      peers: {
        closeTimeout: 30,
        unhealthyTimeout: 10,
      },
    })
    server.onPeerHealthChange((event) => {
      health.push({
        healthy: event.healthy,
        silentFor: event.silentFor,
      })
    })
    server.accept({
      close: closed,
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    server.checkLiveness(Date.now() + 11)

    expect(health).toEqual([{ healthy: false, silentFor: expect.any(Number) }])
    expect(closed).not.toHaveBeenCalled()
    expect(server.peers.has('peer-1')).toBe(true)
  })

  it('removes the peer even when the underlying close operation throws', () => {
    const server = createServer<string>({
      heartbeat: {
        timeout: 10,
      },
      peers: {
        closeTimeout: 10,
        unhealthyTimeout: 10,
      },
    })
    server.accept({
      close: () => {
        throw new Error('raw close failed')
      },
      id: 'peer-1',
      send: vi.fn(() => true),
    })

    expect(() => server.checkLiveness(Date.now() + 10)).toThrow('raw close failed')
    expect(server.peers.has('peer-1')).toBe(false)
  })
})
