import type { RouteTargetExpression, WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../types'

import { describe, expect, it } from 'vitest'

import { collectDestinations, createPolicyMiddleware, isDevtoolsPeer, matchesDestinations } from './route'
import { matchesLabelSelector, matchesLabelSelectors, matchesRouteExpression } from './route/match-expression'

function createExtensionModulePeer(): AuthenticatedPeer {
  const peer = createPeer({
    extension: 'airi-extension-chess',
    id: 'peer-extension',
    instanceId: 'extension-session-1',
    name: 'airi-extension-chess',
  })

  peer.extensionModules = new Map([
    ['chess-gamelet', {
      identity: {
        extension: {
          id: 'airi-extension-chess',
          sessionId: 'extension-session-1',
        },
        id: 'chess-gamelet',
      },
      name: 'character',
    }],
  ])

  return peer
}

function createPeer(options: {
  authenticated?: boolean
  extension?: string
  extensionLabels?: Record<string, string>
  id: string
  instanceId?: string
  labels?: Record<string, string>
  name: string
  peerIds?: string[]
}): AuthenticatedPeer {
  return {
    authenticated: options.authenticated ?? true,
    extensionIdentity: options.extensionLabels
      ? { id: options.name, labels: options.extensionLabels, sessionId: `${options.id}-session` }
      : undefined,
    identity: options.extension && options.instanceId
      ? { extension: { id: options.extension }, id: options.instanceId, labels: options.labels }
      : undefined,
    name: options.name,
    peer: {
      id: options.id,
      remoteAddress: '127.0.0.1',
      request: { headers: new Headers(), url: 'http://localhost' },
      send: () => 0,
    },
    peerIds: options.peerIds ? new Set(options.peerIds) : undefined,
  }
}

function createSparkNotifyEvent(overrides: Partial<WebSocketEventOf<'spark:notify'>> = {}): WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any> {
  const data: WebSocketEvents['spark:notify'] = {
    destinations: ['module:character'],
    eventId: 'spark-1',
    headline: 'hello',
    id: 'evt-1',
    kind: 'ping',
    urgency: 'soon',
    ...overrides.data,
  }

  return {
    data,
    metadata: overrides.metadata ?? {
      event: { id: data.id },
      source: { extension: { id: 'server-runtime' }, id: 'test' },
    },
    route: overrides.route,
    type: 'spark:notify',
  } as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any>
}

describe('match-expression', () => {
  it('matches label selectors', () => {
    expect(matchesLabelSelector('env=prod', { env: 'prod' })).toBe(true)
    expect(matchesLabelSelector('env=prod', { env: 'dev' })).toBe(false)
    expect(matchesLabelSelector('feature', { feature: 'on' })).toBe(true)
    expect(matchesLabelSelector('missing', { env: 'prod' })).toBe(false)
    expect(matchesLabelSelector(' env = prod ', { env: 'prod' })).toBe(true)
  })

  it('matches label selector list', () => {
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'backend' })).toBe(true)
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'frontend' })).toBe(false)
  })

  it('matches route expressions', () => {
    const peer = createPeer({
      extension: 'stage-ui',
      id: 'peer-1',
      instanceId: 'stage-ui-1',
      labels: { env: 'prod' },
      name: 'stage-ui',
    })

    const expression: RouteTargetExpression = { selectors: ['env=prod'], type: 'label' }
    expect(matchesRouteExpression(expression, peer)).toBe(true)

    const globExpression: RouteTargetExpression = { glob: 'stage-*', type: 'glob' }
    expect(matchesRouteExpression(globExpression, peer)).toBe(true)
  })
})

describe('route middleware', () => {
  it('collects destinations from route before data', () => {
    const event = createSparkNotifyEvent({
      data: {
        destinations: ['module:character'],
        eventId: 'spark-2',
        headline: 'hello',
        id: 'evt-2',
        kind: 'ping',
        urgency: 'soon',
      },
      route: { destinations: ['label:env=prod'] },
    })

    expect(collectDestinations(event)).toEqual(['label:env=prod'])
  })
  it('treats an explicit empty route destination list as the override', () => {
    const event = createSparkNotifyEvent({
      data: {
        destinations: ['module:character'],
        eventId: 'spark-override',
        headline: 'hello',
        id: 'evt-override',
        kind: 'ping',
        urgency: 'soon',
      },
      route: { destinations: [] },
    })

    expect(collectDestinations(event)).toEqual([])
  })

  it('treats an explicit empty data destination list as the override', () => {
    const event = createSparkNotifyEvent({
      data: {
        destinations: [],
        eventId: 'spark-data-empty',
        headline: 'hello',
        id: 'evt-data-empty',
        kind: 'ping',
        urgency: 'soon',
      },
      route: undefined,
    })

    expect(collectDestinations(event)).toEqual([])
  })

  it('ignores primitive data payloads when checking destinations', () => {
    const event = {
      data: 'not-an-object',
      metadata: {
        event: { id: 'evt-primitive' },
        source: { extension: { id: 'server-runtime' }, id: 'test' },
      },
      route: undefined,
      type: 'spark:notify',
    } as unknown as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any>

    expect(collectDestinations(event)).toBeUndefined()
  })

  it('matches destinations by label selector', () => {
    const peer = createPeer({
      extension: 'telegram-bot',
      id: 'peer-2',
      instanceId: 'telegram-1',
      labels: { app: 'telegram', env: 'prod' },
      name: 'telegram-bot',
    })

    expect(matchesDestinations(['label:app=telegram'], peer)).toBe(true)
    expect(matchesDestinations(['label:env=dev'], peer)).toBe(false)
  })

  /**
   * @example
   * expect(matchesDestinations(['label:surface=websocket-extension'], peer)).toBe(true)
   */
  it('matches destinations by extension identity labels', () => {
    const peer = createPeer({
      extensionLabels: { surface: 'websocket-extension' },
      id: 'peer-extension-labels',
      name: 'airi-extension',
    })

    expect(matchesDestinations(['label:surface=websocket-extension'], peer)).toBe(true)
    expect(matchesRouteExpression({ selectors: ['surface=websocket-extension'], type: 'label' }, peer)).toBe(true)
    expect(matchesDestinations(['label:surface=legacy-plugin'], peer)).toBe(false)
  })

  /**
   * @example
   * expect(matchesDestinations(['peer:stage-window'], peer)).toBe(true)
   */
  it('matches destinations by acknowledged peer id aliases', () => {
    const peer = createPeer({
      id: 'runtime-peer-1',
      name: 'stage-window',
      peerIds: ['runtime-peer-1', 'stage-window'],
    })

    expect(matchesDestinations(['peer:stage-window'], peer)).toBe(true)
    expect(matchesDestinations([{ ids: ['stage-window'], type: 'ids' }], peer)).toBe(true)
    expect(matchesDestinations(['peer:missing'], peer)).toBe(false)
  })

  /**
   * @example
   * expect(matchesDestinations(['module:character'], peer)).toBe(true)
   */
  it('matches destinations by announced extension module name', () => {
    const peer = createExtensionModulePeer()

    expect(matchesDestinations(['module:character'], peer)).toBe(true)
    expect(matchesDestinations(['character'], peer)).toBe(true)
    expect(matchesDestinations(['chess-*'], peer)).toBe(true)
    expect(matchesDestinations(['module:missing'], peer)).toBe(false)
    expect(matchesDestinations(['missing'], peer)).toBe(false)
  })

  it('policy middleware filters targets', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ extension: 'telegram-bot', id: 'peer-1', instanceId: 'telegram-1', labels: { env: 'prod' }, name: 'telegram' })],
      ['peer-2', createPeer({ extension: 'stage-ui', id: 'peer-2', instanceId: 'stage-ui-1', labels: { env: 'dev' }, name: 'stage-ui' })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      destinations: undefined,
      event: createSparkNotifyEvent(),
      fromPeer: peers.get('peer-1')!,
      peers,
    })

    expect(decision).toBeDefined()
    if (!decision)
      return

    expect(decision?.type).toBe('targets')
    if (decision.type !== 'targets')
      return

    expect([...decision!.targetIds]).toEqual(['peer-1'])
  })

  it('policy middleware excludes unauthenticated peers', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ extension: 'telegram-bot', id: 'peer-1', instanceId: 'telegram-1', labels: { env: 'prod' }, name: 'telegram' })],
      ['peer-2', createPeer({ authenticated: false, extension: 'stage-ui', id: 'peer-2', instanceId: 'stage-ui-1', labels: { env: 'prod' }, name: 'stage-ui' })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      destinations: undefined,
      event: createSparkNotifyEvent(),
      fromPeer: peers.get('peer-1')!,
      peers,
    })

    expect(decision).toBeDefined()
    if (!decision || decision.type !== 'targets')
      return

    expect([...decision.targetIds]).toEqual(['peer-1'])
  })

  it('policy middleware does not authorize bypass by itself', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ extension: 'telegram-bot', id: 'peer-1', instanceId: 'telegram-1', labels: { env: 'prod' }, name: 'telegram' })],
      ['peer-2', createPeer({ extension: 'stage-ui', id: 'peer-2', instanceId: 'stage-ui-1', labels: { env: 'dev' }, name: 'stage-ui' })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      destinations: undefined,
      event: createSparkNotifyEvent({ route: { bypass: true } }),
      fromPeer: peers.get('peer-1')!,
      peers,
    })

    expect(decision).toBeDefined()
    if (!decision || decision.type !== 'targets')
      return

    expect([...decision.targetIds]).toEqual(['peer-1'])
  })

  it('devtools peer detection uses label', () => {
    const peer = createPeer({
      extension: 'debug-ui',
      id: 'peer-3',
      instanceId: 'debug-ui-1',
      labels: { devtools: 'true' },
      name: 'debug-ui',
    })

    expect(isDevtoolsPeer(peer)).toBe(true)
  })
})
