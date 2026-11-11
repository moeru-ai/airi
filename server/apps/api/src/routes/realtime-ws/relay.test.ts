import { describe, expect, it } from 'vitest'

import { userRealtimeRelayRedisKey } from '../../utils/redis-keys'
import { createRealtimeRelay } from './relay'
import { createPubSubBus } from './testing'

function join(relay: ReturnType<typeof createRealtimeRelay>, userId: string) {
  const received: string[] = []
  return { received, connection: relay.join(userId, frame => received.push(frame)) }
}

describe('realtime relay', () => {
  it('sends a frame to the other connections of the user and not to the sender', () => {
    const relay = createRealtimeRelay({ redis: createPubSubBus().connect(), instanceId: 'a' })
    const phone = join(relay, 'user-1')
    const desktop = join(relay, 'user-1')
    const tablet = join(relay, 'user-1')

    phone.connection.forward('frame-1')

    expect(phone.received).toEqual([])
    expect(desktop.received).toEqual(['frame-1'])
    expect(tablet.received).toEqual(['frame-1'])
  })

  it('does not send a frame to another user', () => {
    const relay = createRealtimeRelay({ redis: createPubSubBus().connect(), instanceId: 'a' })
    const phone = join(relay, 'user-1')
    const stranger = join(relay, 'user-2')

    phone.connection.forward('frame-1')

    expect(stranger.received).toEqual([])
  })

  it('delivers a frame once to a connection on another instance', () => {
    const bus = createPubSubBus()
    const relayA = createRealtimeRelay({ redis: bus.connect(), instanceId: 'a' })
    const relayB = createRealtimeRelay({ redis: bus.connect(), instanceId: 'b' })
    const phone = join(relayA, 'user-1')
    const tablet = join(relayA, 'user-1')
    const desktop = join(relayB, 'user-1')
    const stranger = join(relayB, 'user-2')

    phone.connection.forward('frame-1')

    expect(desktop.received).toEqual(['frame-1'])
    // The origin instance delivers locally and skips its own published message.
    expect(tablet.received).toEqual(['frame-1'])
    expect(phone.received).toEqual([])
    expect(stranger.received).toEqual([])
  })

  it('stops delivery and forwarding after a connection leaves', () => {
    const relay = createRealtimeRelay({ redis: createPubSubBus().connect(), instanceId: 'a' })
    const phone = join(relay, 'user-1')
    const desktop = join(relay, 'user-1')

    desktop.connection.leave()
    desktop.connection.leave()
    phone.connection.forward('frame-1')
    desktop.connection.forward('frame-2')

    expect(desktop.received).toEqual([])
    expect(phone.received).toEqual([])
    expect(relay.activeCount()).toBe(1)
  })

  it('keeps the channel subscription until the last connection of the user leaves', () => {
    const bus = createPubSubBus()
    const relay = createRealtimeRelay({ redis: bus.connect(), instanceId: 'a' })
    const phone = join(relay, 'user-1')
    const desktop = join(relay, 'user-1')
    const channel = userRealtimeRelayRedisKey('user-1')

    phone.connection.leave()
    expect(bus.subscribedChannels()).toEqual([channel])

    desktop.connection.leave()
    expect(bus.subscribedChannels()).toEqual([])
    expect(relay.activeCount()).toBe(0)
  })

  it('ignores a Pub/Sub message that is not a relay message', () => {
    const bus = createPubSubBus()
    const relay = createRealtimeRelay({ redis: bus.connect(), instanceId: 'a' })
    const desktop = join(relay, 'user-1')
    const channel = userRealtimeRelayRedisKey('user-1')

    bus.publishRaw(channel, 'not json')
    bus.publishRaw(channel, JSON.stringify({ originInstanceId: 'b', userId: 'user-1' }))
    bus.publishRaw(channel, JSON.stringify({ originInstanceId: 'b', userId: 'user-1', frame: 'frame-1' }))

    expect(desktop.received).toEqual(['frame-1'])
  })
})
