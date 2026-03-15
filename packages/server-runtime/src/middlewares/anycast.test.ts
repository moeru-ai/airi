import type { WebSocketBaseEvent, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../types'
import type { RouteDecision } from './route'

import { describe, expect, it } from 'vitest'

import { createAnycastMiddleware } from './anycast'

function createPeer(options: {
  id: string
  name: string
  plugin: string
  instanceId: string
  authenticated?: boolean
  healthy?: boolean
}): AuthenticatedPeer {
  return {
    peer: { id: options.id, send: () => 0 },
    authenticated: options.authenticated ?? true,
    healthy: options.healthy,
    name: options.name,
    identity: { kind: 'plugin', plugin: { id: options.plugin }, id: options.instanceId },
  }
}

function createInputEvent(overrides: Partial<WebSocketBaseEvent<'input:text', WebSocketEvents['input:text'], any>> = {}): WebSocketBaseEvent<'input:text', WebSocketEvents['input:text'], any> {
  return {
    type: 'input:text',
    data: { text: 'hi' } as any,
    route: overrides.route,
    metadata: overrides.metadata ?? {
      source: { kind: 'plugin', plugin: { id: 'qq-bot' }, id: 'qq-1' },
      event: { id: 'evt-1' },
    },
  } as WebSocketBaseEvent<'input:text', WebSocketEvents['input:text'], any>
}

describe('anycast middleware', () => {
  it('selects a single deterministic target', () => {
    const fromPeer = createPeer({ id: 'peer-from', name: 'qq', plugin: 'qq-bot', instanceId: 'qq-1' })
    const peers = new Map<string, AuthenticatedPeer>([
      [fromPeer.peer.id, fromPeer],
      ['peer-a', createPeer({ id: 'peer-a', name: 'stage-web', plugin: 'proj-airi:stage-web', instanceId: 'web-1' })],
      ['peer-b', createPeer({ id: 'peer-b', name: 'stage-web', plugin: 'proj-airi:stage-web', instanceId: 'web-2' })],
    ])

    const middleware = createAnycastMiddleware()
    const event = createInputEvent({
      route: {
        strategy: 'anycast',
        destinations: ['plugin:proj-airi:stage-web'],
      },
      metadata: {
        source: { kind: 'plugin', plugin: { id: 'qq-bot' }, id: 'qq-1' },
        event: { id: 'evt-fixed' },
      },
    })

    const first = middleware({ event, fromPeer, peers, destinations: event.route?.destinations }) as RouteDecision | undefined
    const second = middleware({ event, fromPeer, peers, destinations: event.route?.destinations }) as RouteDecision | undefined

    expect(first).toEqual(second)
    expect(first?.type).toBe('targets')
    if (!first || first.type !== 'targets') {
      return
    }
    expect(first.targetIds.size).toBe(1)
    const selected = [...first.targetIds][0]
    expect(['peer-a', 'peer-b']).toContain(selected)
  })
})
