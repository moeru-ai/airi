import type { GeometryRequest, Layout, PointerSample } from '../src/protocol'

import { describe, expect, it } from 'vitest'

import { CallerScope } from '../src/caller-scope'
import { decodeGeometryRequest, projectPointer } from '../src/protocol'

const request: GeometryRequest = {
  version: 1,
  sessionId: 'session-1',
  surfaceId: 'main-stage',
  requestId: 'request-1',
  sequence: 1,
  layoutRevision: 3,
  createdAtMs: 1000,
  bounds: { x: -500, y: 100, width: 300, height: 500 },
}
const layout: Layout = {
  coordinateSpace: 'kwin-logical-desktop',
  revision: 3,
  outputs: [{ id: 'portrait-left', bounds: { x: -1080, y: -200, width: 1080, height: 1920 }, workArea: { x: -1080, y: -180, width: 1080, height: 1900 }, scale: 2 }],
}
const sample: PointerSample = {
  coordinateSpace: 'kwin-logical-desktop',
  source: 'kwin-companion-experiment',
  sessionId: 'session-1',
  sequence: 1,
  layoutRevision: 3,
  capturedAtMs: 1000,
  position: { x: -800, y: -100 },
  outputId: 'portrait-left',
}
const contentBounds = { x: -1000, y: -200, width: 400, height: 500 }

describe('bounded protocol frames', () => {
  it('accepts a valid geometry request', () => {
    expect(decodeGeometryRequest(JSON.stringify(request))).toEqual(request)
  })

  it.each([
    '{',
    'x'.repeat(8193),
    JSON.stringify({ ...request, version: 2 }),
    JSON.stringify({ ...request, sequence: -1 }),
    JSON.stringify({ ...request, bounds: { ...request.bounds, width: 0 } }),
    JSON.stringify({ ...request, bounds: { ...request.bounds, x: null } }),
    JSON.stringify({ ...request, arbitraryWindowId: 'other-application' }),
  ])('rejects invalid input without forwarding it: %s', (frame) => {
    expect(decodeGeometryRequest(frame)).toBeNull()
  })

  it('projects compositor content coordinates using zoom once, without output scale', () => {
    expect(projectPointer(sample, 'session-1', layout, contentBounds, 1.25, 1100)).toEqual({ x: 160, y: 80 })
  })

  it.each([
    { sessionId: 'old-session' },
    { layoutRevision: 2 },
    { capturedAtMs: 849 },
    { capturedAtMs: 1101 },
    { capturedAtMs: Number.NaN },
    { outputId: 'removed-monitor' },
    { position: { x: 0, y: 0 } },
    { position: { x: Number.NaN, y: 0 } },
  ])('returns neutral gaze for stale or invalid samples: %j', (changes) => {
    expect(projectPointer({ ...sample, ...changes }, 'session-1', layout, contentBounds, 1, 1100)).toBeNull()
  })

  it('rejects invalid zoom factors and wall clocks', () => {
    expect(projectPointer(sample, 'session-1', layout, contentBounds, 0, 1100)).toBeNull()
    expect(projectPointer(sample, 'session-1', layout, contentBounds, 1, Number.NaN)).toBeNull()
  })
})

describe('trusted D-Bus caller scope', () => {
  const peer = { uniqueOwner: ':1.4', uid: 1000, pid: 42 }
  const process = { pid: 88, birthId: 'boot-id:proc-start-time' }

  it('pins bus owner, UID, and PID without accepting payload identity claims', () => {
    const scope = new CallerScope(peer, process)
    expect(scope.accepts(peer)).toBe(true)
    expect(scope.accepts({ ...peer, uniqueOwner: ':1.5' })).toBe(false)
    expect(scope.accepts({ ...peer, uid: 1001 })).toBe(false)
    expect(scope.accepts({ ...peer, pid: 43 })).toBe(false)
  })

  it('does not accept owner reuse after revocation', () => {
    const scope = new CallerScope(peer, process)
    scope.ownerChanged(':1.5')
    scope.ownerChanged(peer.uniqueOwner)
    expect(scope.accepts(peer)).toBe(false)
  })

  it('detects PID reuse and does not revive the old process', () => {
    const scope = new CallerScope(peer, process)
    expect(scope.processMatches({ ...process, birthId: 'different-process' })).toBe(false)
    expect(scope.processMatches(process)).toBe(false)
  })

  it('copies trusted bootstrap identities instead of retaining mutable caller data', () => {
    const owner = { ...peer }
    const enrolled = { ...process }
    const scope = new CallerScope(owner, enrolled)
    owner.uniqueOwner = ':1.99'
    enrolled.birthId = 'new-process'
    expect(scope.accepts(owner)).toBe(false)
    expect(scope.accepts(peer)).toBe(true)
    expect(scope.processMatches(process)).toBe(true)
  })
})
