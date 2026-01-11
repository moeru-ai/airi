import type { RouteTargetExpression, WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../types'

import { describe, expect, it } from 'vitest'

import { collectDestinations, createPolicyMiddleware, isDevtoolsPeer, matchesDestinations } from './route'
import { matchesLabelSelector, matchesLabelSelectors, matchesRouteExpression } from './route/match-expression'

function createPeer(options: {
  id: string
  name: string
  plugin?: string
  instanceId?: string
  labels?: Record<string, string>
}): AuthenticatedPeer {
  return {
    peer: { id: options.id, send: () => 0 },
    authenticated: true,
    name: options.name,
    identity: options.plugin && options.instanceId
      ? { plugin: options.plugin, instanceId: options.instanceId, labels: options.labels }
      : undefined,
  }
}

function createSparkNotifyEvent(overrides: Partial<WebSocketEventOf<'spark:notify'>> = {}): WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any> {
  const data: WebSocketEvents['spark:notify'] = {
    id: 'evt-1',
    eventId: 'spark-1',
    kind: 'ping',
    urgency: 'soon',
    headline: 'hello',
    destinations: ['module:character'],
    ...overrides.data,
  }

  return {
    type: 'spark:notify',
    data,
    metadata: overrides.metadata ?? {
      source: { plugin: 'server-runtime', instanceId: 'test' },
      event: { id: data.id },
    },
    route: overrides.route,
  } as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any>
}

describe('match-expression', () => {
  it('matches label selectors', () => {
    expect(matchesLabelSelector('env=prod', { env: 'prod' })).toBe(true)
    expect(matchesLabelSelector('env=prod', { env: 'dev' })).toBe(false)
    expect(matchesLabelSelector('feature', { feature: 'on' })).toBe(true)
    expect(matchesLabelSelector('missing', { env: 'prod' })).toBe(false)
  })

  it('matches label selector list', () => {
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'backend' })).toBe(true)
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'frontend' })).toBe(false)
  })

  it('matches route expressions', () => {
    const peer = createPeer({
      id: 'peer-1',
      name: 'stage-ui',
      plugin: 'stage-ui',
      instanceId: 'stage-ui-1',
      labels: { env: 'prod' },
    })

    const expression: RouteTargetExpression = { type: 'label', selectors: ['env=prod'] }
    expect(matchesRouteExpression(expression, peer)).toBe(true)

    const globExpression: RouteTargetExpression = { type: 'glob', glob: 'stage-*' }
    expect(matchesRouteExpression(globExpression, peer)).toBe(true)
  })
})

describe('route middleware', () => {
  it('collects destinations from route before data', () => {
    const event = createSparkNotifyEvent({
      data: {
        id: 'evt-2',
        eventId: 'spark-2',
        kind: 'ping',
        urgency: 'soon',
        headline: 'hello',
        destinations: ['module:character'],
      },
      route: { destinations: ['label:env=prod'] },
    })

    expect(collectDestinations(event)).toEqual(['label:env=prod'])
  })

  it('matches destinations by label selector', () => {
    const peer = createPeer({
      id: 'peer-2',
      name: 'telegram-bot',
      plugin: 'telegram-bot',
      instanceId: 'telegram-1',
      labels: { app: 'telegram', env: 'prod' },
    })

    expect(matchesDestinations(['label:app=telegram'], peer)).toBe(true)
    expect(matchesDestinations(['label:env=dev'], peer)).toBe(false)
  })

  it('policy middleware filters targets', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ id: 'peer-1', name: 'telegram', plugin: 'telegram-bot', instanceId: 'telegram-1', labels: { env: 'prod' } })],
      ['peer-2', createPeer({ id: 'peer-2', name: 'stage-ui', plugin: 'stage-ui', instanceId: 'stage-ui-1', labels: { env: 'dev' } })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      event: createSparkNotifyEvent(),
      fromPeer: peers.get('peer-1')!,
      peers,
      destinations: undefined,
    })

    expect(decision).toBeDefined()
    if (!decision)
      return

    expect(decision?.type).toBe('targets')
    if (decision.type !== 'targets')
      return

    expect([...decision!.targetIds]).toEqual(['peer-1'])
  })

  it('devtools peer detection uses label', () => {
    const peer = createPeer({
      id: 'peer-3',
      name: 'debug-ui',
      plugin: 'debug-ui',
      instanceId: 'debug-ui-1',
      labels: { devtools: 'true' },
    })

    expect(isDevtoolsPeer(peer)).toBe(true)
  })
})
