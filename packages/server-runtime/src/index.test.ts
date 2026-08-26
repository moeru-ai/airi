import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { ConsumerStickyAssignment } from './server-ws/airi/consumers'

import { describe, expect, it } from 'vitest'

import { heartbeatFrameFrom } from './server-ws/airi/codec'
import { selectConsumerPeerId } from './server-ws/airi/consumers'
import { resolveEventDelivery } from './server-ws/airi/routing'

function createInputTextEvent(
  overrides: Partial<WebSocketBaseEvent<'input:text', WebSocketEvents['input:text']>> = {},
): WebSocketBaseEvent<'input:text', WebSocketEvents['input:text']> {
  return {
    data: {
      text: 'hello',
      ...overrides.data,
    },
    metadata: overrides.metadata ?? {
      event: {
        id: 'event-1',
      },
      source: {
        id: 'discord-instance',
        kind: 'plugin',
        plugin: { id: 'discord' },
      },
    },
    route: overrides.route,
    type: 'input:text',
  }
}

describe('resolveEventDelivery', () => {
  it('uses protocol event metadata defaults for input:text', () => {
    const delivery = resolveEventDelivery(createInputTextEvent())

    expect(delivery).toEqual({
      group: 'chat-ingestion',
      mode: 'consumer-group',
      selection: 'first',
    })
  })

  it('allows route delivery to override protocol defaults', () => {
    const delivery = resolveEventDelivery(createInputTextEvent({
      route: {
        delivery: {
          required: true,
          selection: 'sticky',
          stickyKey: 'discord-dm-user-1',
        },
      },
    }))

    expect(delivery).toEqual({
      group: 'chat-ingestion',
      mode: 'consumer-group',
      required: true,
      selection: 'sticky',
      stickyKey: 'discord-dm-user-1',
    })
  })

  it('returns explicit route delivery for events without protocol defaults', () => {
    const delivery = resolveEventDelivery({
      data: {
        destinations: ['module:character'],
        eventId: 'spark-notify-1',
        headline: 'hello',
        id: 'spark-1',
        kind: 'ping',
        urgency: 'soon',
      },
      metadata: {
        event: {
          id: 'event-2',
        },
        source: {
          id: 'stage-web-instance',
          kind: 'plugin',
          plugin: { id: 'stage-web' },
        },
      },
      route: {
        delivery: {
          mode: 'consumer',
          required: true,
        },
      },
      type: 'spark:notify',
    })

    expect(delivery).toEqual({
      mode: 'consumer',
      required: true,
    })
  })
})

describe('selectConsumerPeerId', () => {
  it('selects the highest-priority healthy consumer in the delivery group', () => {
    const selectedPeerId = selectConsumerPeerId({
      candidates: [
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 2,
        },
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-b',
          priority: 20,
          registeredAt: 3,
        },
        {
          authenticated: true,
          healthy: false,
          peerId: 'stage-window-c',
          priority: 30,
          registeredAt: 1,
        },
      ],
      delivery: {
        group: 'chat-ingestion',
        mode: 'consumer-group',
        selection: 'priority',
      },
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
    })

    expect(selectedPeerId).toBe('stage-window-b')
  })

  it('keeps sticky delivery on the same consumer when available', () => {
    const stickyAssignments = new Map<string, ConsumerStickyAssignment>()

    const firstSelectedPeerId = selectConsumerPeerId({
      candidates: [
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 1,
        },
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-b',
          priority: 10,
          registeredAt: 2,
        },
      ],
      delivery: {
        group: 'chat-ingestion',
        mode: 'consumer-group',
        selection: 'sticky',
        stickyKey: 'discord-dm-user-1',
      },
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
      stickyAssignments,
    })

    const secondSelectedPeerId = selectConsumerPeerId({
      candidates: [
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 1,
        },
        {
          authenticated: true,
          healthy: true,
          peerId: 'stage-window-b',
          priority: 10,
          registeredAt: 2,
        },
      ],
      delivery: {
        group: 'chat-ingestion',
        mode: 'consumer-group',
        selection: 'sticky',
        stickyKey: 'discord-dm-user-1',
      },
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
      stickyAssignments,
    })

    expect(firstSelectedPeerId).toBe('stage-window-a')
    expect(secondSelectedPeerId).toBe('stage-window-a')
  })
})

describe('heartbeatFrameFrom', () => {
  it('recognizes raw websocket control frame text without treating it as protocol JSON', () => {
    expect(heartbeatFrameFrom('ping')).toBe('ping')
    expect(heartbeatFrameFrom('pong')).toBe('pong')
  })

  it('ignores non-control payloads', () => {
    expect(heartbeatFrameFrom('')).toBeUndefined()
    expect(heartbeatFrameFrom('🩵')).toBeUndefined()
    expect(heartbeatFrameFrom('{"type":"transport:connection:heartbeat"}')).toBeUndefined()
  })
})
