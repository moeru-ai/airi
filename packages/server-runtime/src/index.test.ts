import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import { describe, expect, it } from 'vitest'

import { resolveDeliveryConfig, selectConsumerPeerId } from './index'

function createInputTextEvent(
  overrides: Partial<WebSocketBaseEvent<'input:text', WebSocketEvents['input:text']>> = {},
): WebSocketBaseEvent<'input:text', WebSocketEvents['input:text']> {
  return {
    type: 'input:text',
    data: {
      text: 'hello',
      ...overrides.data,
    },
    metadata: overrides.metadata ?? {
      source: {
        kind: 'plugin',
        plugin: { id: 'discord' },
        id: 'discord-instance',
      },
      event: {
        id: 'event-1',
      },
    },
    route: overrides.route,
  }
}

describe('resolveDeliveryConfig', () => {
  it('uses protocol event metadata defaults for input:text', () => {
    const delivery = resolveDeliveryConfig(createInputTextEvent())

    expect(delivery).toEqual({
      mode: 'consumer-group',
      group: 'chat-ingestion',
      selection: 'first',
    })
  })

  it('allows route delivery to override protocol defaults', () => {
    const delivery = resolveDeliveryConfig(createInputTextEvent({
      route: {
        delivery: {
          required: true,
          selection: 'sticky',
          stickyKey: 'discord-dm-user-1',
        },
      },
    }))

    expect(delivery).toEqual({
      mode: 'consumer-group',
      group: 'chat-ingestion',
      required: true,
      selection: 'sticky',
      stickyKey: 'discord-dm-user-1',
    })
  })

  it('returns explicit route delivery for events without protocol defaults', () => {
    const delivery = resolveDeliveryConfig({
      type: 'spark:notify',
      data: {
        id: 'spark-1',
        eventId: 'spark-notify-1',
        kind: 'ping',
        urgency: 'soon',
        headline: 'hello',
        destinations: ['module:character'],
      },
      metadata: {
        source: {
          kind: 'plugin',
          plugin: { id: 'stage-web' },
          id: 'stage-web-instance',
        },
        event: {
          id: 'event-2',
        },
      },
      route: {
        delivery: {
          mode: 'consumer',
          required: true,
        },
      },
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
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
      delivery: {
        mode: 'consumer-group',
        group: 'chat-ingestion',
        selection: 'priority',
      },
      candidates: [
        {
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 2,
          authenticated: true,
          healthy: true,
        },
        {
          peerId: 'stage-window-b',
          priority: 20,
          registeredAt: 3,
          authenticated: true,
          healthy: true,
        },
        {
          peerId: 'stage-window-c',
          priority: 30,
          registeredAt: 1,
          authenticated: true,
          healthy: false,
        },
      ],
    })

    expect(selectedPeerId).toBe('stage-window-b')
  })

  it('keeps sticky delivery on the same consumer when available', () => {
    const stickyAssignments = new Map<string, string>()

    const firstSelectedPeerId = selectConsumerPeerId({
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
      delivery: {
        mode: 'consumer-group',
        group: 'chat-ingestion',
        selection: 'sticky',
        stickyKey: 'discord-dm-user-1',
      },
      candidates: [
        {
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 1,
          authenticated: true,
          healthy: true,
        },
        {
          peerId: 'stage-window-b',
          priority: 10,
          registeredAt: 2,
          authenticated: true,
          healthy: true,
        },
      ],
      stickyAssignments,
    })

    const secondSelectedPeerId = selectConsumerPeerId({
      eventType: 'input:text',
      fromPeerId: 'discord-instance',
      delivery: {
        mode: 'consumer-group',
        group: 'chat-ingestion',
        selection: 'sticky',
        stickyKey: 'discord-dm-user-1',
      },
      candidates: [
        {
          peerId: 'stage-window-a',
          priority: 10,
          registeredAt: 1,
          authenticated: true,
          healthy: true,
        },
        {
          peerId: 'stage-window-b',
          priority: 10,
          registeredAt: 2,
          authenticated: true,
          healthy: true,
        },
      ],
      stickyAssignments,
    })

    expect(firstSelectedPeerId).toBe('stage-window-a')
    expect(secondSelectedPeerId).toBe('stage-window-a')
  })
})
