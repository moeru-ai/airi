import type { RouteTargetExpression, WebSocketBaseEvent, WebSocketEventOf, WebSocketEvents } from '@proj-airi/server-shared/types'

import type { AuthenticatedPeer } from '../types'

import { describe, expect, it } from 'vitest'

import { collectDestinations, createPolicyMiddleware, isDevtoolsPeer, matchesDestinations } from './route'
import { matchesLabelSelector, matchesLabelSelectors, matchesRouteExpression } from './route/match-expression'

function createPeer(options: {
  id: string
  name: string
  peerIds?: string[]
  extensionLabels?: Record<string, string>
  extension?: string
  instanceId?: string
  labels?: Record<string, string>
  authenticated?: boolean
}): AuthenticatedPeer {
  return {
    peer: {
      id: options.id,
      send: () => 0,
      request: { url: 'http://localhost', headers: new Headers() },
      remoteAddress: '127.0.0.1',
    },
    authenticated: options.authenticated ?? true,
    peerIds: options.peerIds ? new Set(options.peerIds) : undefined,
    name: options.name,
    identity: options.extension && options.instanceId
      ? { id: options.instanceId, extension: { id: options.extension }, labels: options.labels }
      : undefined,
    extensionIdentity: options.extensionLabels
      ? { id: options.name, sessionId: `${options.id}-session`, labels: options.extensionLabels }
      : undefined,
  }
}

function createExtensionModulePeer(): AuthenticatedPeer {
  const peer = createPeer({
    id: 'peer-extension',
    name: 'airi-extension-chess',
    extension: 'airi-extension-chess',
    instanceId: 'extension-session-1',
  })

  peer.extensionModules = new Map([
    ['chess-gamelet', {
      name: 'character',
      identity: {
        id: 'chess-gamelet',
        extension: {
          id: 'airi-extension-chess',
          sessionId: 'extension-session-1',
        },
      },
    }],
  ])

  return peer
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
      source: { id: 'test', extension: { id: 'server-runtime' } },
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
    expect(matchesLabelSelector(' env = prod ', { env: 'prod' })).toBe(true)
  })

  it('matches label selector list', () => {
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'backend' })).toBe(true)
    expect(matchesLabelSelectors(['env=prod', 'tier=backend'], { env: 'prod', tier: 'frontend' })).toBe(false)
  })

  it('matches route expressions', () => {
    const peer = createPeer({
      id: 'peer-1',
      name: 'stage-ui',
      extension: 'stage-ui',
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
  it('treats an explicit empty route destination list as the override', () => {
    const event = createSparkNotifyEvent({
      data: {
        id: 'evt-override',
        eventId: 'spark-override',
        kind: 'ping',
        urgency: 'soon',
        headline: 'hello',
        destinations: ['module:character'],
      },
      route: { destinations: [] },
    })

    expect(collectDestinations(event)).toEqual([])
  })

  it('treats an explicit empty data destination list as the override', () => {
    const event = createSparkNotifyEvent({
      data: {
        id: 'evt-data-empty',
        eventId: 'spark-data-empty',
        kind: 'ping',
        urgency: 'soon',
        headline: 'hello',
        destinations: [],
      },
      route: undefined,
    })

    expect(collectDestinations(event)).toEqual([])
  })

  it('ignores primitive data payloads when checking destinations', () => {
    const event = {
      type: 'spark:notify',
      data: 'not-an-object',
      metadata: {
        source: { id: 'test', extension: { id: 'server-runtime' } },
        event: { id: 'evt-primitive' },
      },
      route: undefined,
    } as unknown as WebSocketBaseEvent<'spark:notify', WebSocketEvents['spark:notify'], any>

    expect(collectDestinations(event)).toBeUndefined()
  })

  it('matches destinations by label selector', () => {
    const peer = createPeer({
      id: 'peer-2',
      name: 'telegram-bot',
      extension: 'telegram-bot',
      instanceId: 'telegram-1',
      labels: { app: 'telegram', env: 'prod' },
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
      id: 'peer-extension-labels',
      name: 'airi-extension',
      extensionLabels: { surface: 'websocket-extension' },
    })

    expect(matchesDestinations(['label:surface=websocket-extension'], peer)).toBe(true)
    expect(matchesRouteExpression({ type: 'label', selectors: ['surface=websocket-extension'] }, peer)).toBe(true)
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
    expect(matchesDestinations([{ type: 'ids', ids: ['stage-window'] }], peer)).toBe(true)
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
      ['peer-1', createPeer({ id: 'peer-1', name: 'telegram', extension: 'telegram-bot', instanceId: 'telegram-1', labels: { env: 'prod' } })],
      ['peer-2', createPeer({ id: 'peer-2', name: 'stage-ui', extension: 'stage-ui', instanceId: 'stage-ui-1', labels: { env: 'dev' } })],
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

  it('policy middleware excludes unauthenticated peers', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ id: 'peer-1', name: 'telegram', extension: 'telegram-bot', instanceId: 'telegram-1', labels: { env: 'prod' } })],
      ['peer-2', createPeer({ id: 'peer-2', name: 'stage-ui', extension: 'stage-ui', instanceId: 'stage-ui-1', labels: { env: 'prod' }, authenticated: false })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      event: createSparkNotifyEvent(),
      fromPeer: peers.get('peer-1')!,
      peers,
      destinations: undefined,
    })

    expect(decision).toBeDefined()
    if (!decision || decision.type !== 'targets')
      return

    expect([...decision.targetIds]).toEqual(['peer-1'])
  })

  it('policy middleware does not authorize bypass by itself', () => {
    const peers = new Map<string, AuthenticatedPeer>([
      ['peer-1', createPeer({ id: 'peer-1', name: 'telegram', extension: 'telegram-bot', instanceId: 'telegram-1', labels: { env: 'prod' } })],
      ['peer-2', createPeer({ id: 'peer-2', name: 'stage-ui', extension: 'stage-ui', instanceId: 'stage-ui-1', labels: { env: 'dev' } })],
    ])

    const policy = createPolicyMiddleware({ allowLabels: ['env=prod'] })
    const decision = policy({
      event: createSparkNotifyEvent({ route: { bypass: true } }),
      fromPeer: peers.get('peer-1')!,
      peers,
      destinations: undefined,
    })

    expect(decision).toBeDefined()
    if (!decision || decision.type !== 'targets')
      return

    expect([...decision.targetIds]).toEqual(['peer-1'])
  })

  it('devtools peer detection uses label', () => {
    const peer = createPeer({
      id: 'peer-3',
      name: 'debug-ui',
      extension: 'debug-ui',
      instanceId: 'debug-ui-1',
      labels: { devtools: 'true' },
    })

    expect(isDevtoolsPeer(peer)).toBe(true)
  })
})
