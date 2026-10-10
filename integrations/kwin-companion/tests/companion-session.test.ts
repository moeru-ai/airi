import type { BusPeer } from '../src/caller-scope'
import type { Observation } from '../src/companion-session'
import type { Signal, Window, Workspace } from '../src/kwin-api'
import type { GeometryRequest, Layout, Rectangle } from '../src/protocol'

import { describe, expect, it, vi } from 'vitest'

import { CompanionSession } from '../src/companion-session'

class TestSignal implements Signal {
  readonly handlers = new Set<() => void>()

  connect(handler: () => void): void {
    this.handlers.add(handler)
  }

  disconnect(handler: () => void): void {
    this.handlers.delete(handler)
  }

  emit(): void {
    for (const handler of [...this.handlers])
      handler()
  }
}

class TestWindow implements Window {
  internalId = 'known-window-id'
  pid = 440
  resourceClass = 'airi-test'
  managed = true
  deleted = false
  move = false
  resize = false
  moveable = true
  resizeable = true
  readonly frameGeometryChanged = new TestSignal()
  readonly closed = new TestSignal()
  readonly writes: Rectangle[] = []
  current: Rectangle = { x: 100, y: 100, width: 200, height: 300 }
  appliesImmediately = true

  get frameGeometry(): Rectangle {
    return { ...this.current }
  }

  set frameGeometry(bounds: Rectangle) {
    this.writes.push({ ...bounds })
    if (this.appliesImmediately)
      this.settle(bounds)
  }

  settle(bounds: Rectangle): void {
    this.current = { ...bounds }
    this.frameGeometryChanged.emit()
  }
}

function fixture() {
  let now = 1000
  const peer: BusPeer = { uniqueOwner: ':1.42', uid: 1000, pid: 400 }
  const process = { pid: 440, birthId: 'proc-start-1234' }
  const binding = { sessionId: 'session-one', surfaceId: 'main-stage', windowId: 'known-window-id', resourceClass: 'airi-test', process }
  const window = new TestWindow()
  const layout: Layout = {
    coordinateSpace: 'kwin-logical-desktop',
    revision: 1,
    outputs: [
      { id: 'left', bounds: { x: -1280, y: 0, width: 1280, height: 1024 }, workArea: { x: -1280, y: 40, width: 1280, height: 984 }, scale: 1.25 },
      { id: 'main', bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 40, width: 1920, height: 1040 }, scale: 2 },
    ],
  }
  const workspace = {
    cursorPos: { x: -20, y: 100 },
    cursorPosChanged: new TestSignal(),
    screensChanged: new TestSignal(),
    currentDesktop: { id: 'desktop-1' },
    currentDesktopChanged: new TestSignal(),
    clientArea: vi.fn((_option, output) => ({ ...layout.outputs.find(item => item.id === output.name)!.workArea })),
    screens: layout.outputs.map(output => ({
      name: output.id,
      geometry: output.bounds,
      devicePixelRatio: output.scale,
      geometryChanged: new TestSignal(),
      scaleChanged: new TestSignal(),
    })),
  } satisfies Workspace
  const observations: Observation[] = []
  const publish = vi.fn((event: Observation) => observations.push(event))
  const session = new CompanionSession(workspace, window, binding, peer, () => now, publish, 777)
  const request = (changes: Partial<GeometryRequest> = {}) => JSON.stringify({
    version: 1,
    sessionId: binding.sessionId,
    surfaceId: binding.surfaceId,
    requestId: 'move-1',
    sequence: 1,
    layoutRevision: layout.revision,
    createdAtMs: now,
    bounds: { x: 120, y: 100, width: 220, height: 300 },
    ...changes,
  } satisfies GeometryRequest)
  const advance = (milliseconds: number) => {
    now += milliseconds
  }
  const replies = () => observations.filter(event => event.type === 'geometry').map(event => event.reply)
  const pointers = () => observations.filter(event => event.type === 'pointer').map(event => event.sample)
  return { peer, process, binding, window, layout, workspace, observations, publish, session, request, advance, replies, pointers }
}

describe('experimental KWin surface session', () => {
  it('does not connect signals or sample until explicitly enabled', () => {
    const f = fixture()
    f.session.tick()
    expect(f.publish).not.toHaveBeenCalled()
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.writes).toEqual([])
  })

  it('samples negative origins with per-output scales without multiplying coordinates', () => {
    const f = fixture()
    expect(f.session.enable(f.layout)).toBe(true)
    expect(f.pointers().at(-1)).toMatchObject({ position: { x: -20, y: 100 }, outputId: 'left', layoutRevision: 1, capturedAtMs: 1000 })
    f.workspace.cursorPos = { x: 0, y: 100 }
    f.advance(50)
    f.workspace.cursorPosChanged.emit()
    expect(f.pointers().at(-1)).toMatchObject({ position: { x: 0, y: 100 }, outputId: 'main', sequence: 2 })
  })

  it('bounds signal bursts while refreshing an unmoving pointer on timer ticks', () => {
    const f = fixture()
    f.session.enable(f.layout)
    for (let i = 0; i < 100; i++)
      f.workspace.cursorPosChanged.emit()
    expect(f.pointers().filter(Boolean)).toHaveLength(1)
    f.advance(50)
    f.session.tick()
    expect(f.pointers().filter(Boolean)).toHaveLength(2)
  })

  it('returns neutral gaze in a monitor gap or for non-finite coordinates', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.workspace.cursorPos = { x: -2000, y: -2000 }
    f.advance(50)
    f.session.tick()
    expect(f.pointers().at(-1)).toBeNull()
    f.workspace.cursorPos = { x: Number.NaN, y: 10 }
    f.advance(50)
    f.session.tick()
    expect(f.pointers().at(-1)).toBeNull()
  })

  it('acknowledges the observed bounds for the enrolled window only', () => {
    const f = fixture()
    f.session.enable(f.layout)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(true)
    expect(f.window.writes).toEqual([{ x: 120, y: 100, width: 220, height: 300 }])
    expect(f.replies()).toHaveLength(1)
    expect(f.replies()[0]).toMatchObject({ outcome: 'applied', reason: 'geometry-observed', observedBounds: f.window.current })
  })

  it('waits for compositor readback instead of claiming assignment succeeded', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.session.enable(f.layout)
    f.session.requestGeometry(f.request(), f.peer)
    expect(f.replies()).toEqual([])
    f.advance(100)
    f.window.settle({ x: 120, y: 100, width: 220, height: 300 })
    expect(f.replies()[0]).toMatchObject({ outcome: 'applied' })
  })

  it('reports actual geometry and disables control after an unconfirmed resize', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.session.enable(f.layout)
    f.session.requestGeometry(f.request(), f.peer)
    f.advance(300)
    f.session.tick()
    expect(f.replies()[0]).toMatchObject({ outcome: 'unconfirmed', reason: 'geometry-timeout', observedBounds: f.window.current })
    expect(f.session.requestGeometry(f.request({ sequence: 2 }), f.peer)).toBe(false)
    expect(f.window.writes).toHaveLength(1)
  })

  it.each([
    ['layout-mismatch', { layoutRevision: 9 }],
    ['request-stale', { createdAtMs: 749 }],
    ['request-stale', { createdAtMs: 1001 }],
    ['step-limit', { bounds: { x: 200, y: 100, width: 200, height: 300 } }],
    ['step-limit', { bounds: { x: 100, y: 100, width: 500, height: 300 } }],
    ['outside-current-work-area', { bounds: { x: 100, y: 20, width: 200, height: 300 } }],
    ['outside-current-work-area', { bounds: { x: -200, y: 100, width: 200, height: 300 } }],
  ] as const)('rejects %s before setting geometry', (reason, changes) => {
    const f = fixture()
    f.session.enable(f.layout)
    expect(f.session.requestGeometry(f.request(changes), f.peer)).toBe(false)
    expect(f.replies()[0]?.reason).toBe(reason)
    expect(f.window.writes).toEqual([])
  })

  it('rejects foreign sessions, surfaces, and D-Bus callers without leaking window geometry', () => {
    const f = fixture()
    f.session.enable(f.layout)
    expect(f.session.requestGeometry(f.request({ surfaceId: 'other-app' }), f.peer)).toBe(false)
    expect(f.session.requestGeometry(f.request({ sessionId: 'old-session' }), f.peer)).toBe(false)
    expect(f.session.requestGeometry(f.request(), { ...f.peer, uniqueOwner: ':1.43' })).toBe(false)
    expect(f.replies()).toEqual([])
    expect(f.window.writes).toEqual([])
  })

  it('rejects replayed sequences and excessive movement frequency', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.session.requestGeometry(f.request(), f.peer)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.replies().at(-1)?.reason).toBe('replayed-sequence')
    expect(f.session.requestGeometry(f.request({ sequence: 2 }), f.peer)).toBe(false)
    expect(f.replies().at(-1)?.reason).toBe('request-rate-limit')
    expect(f.window.writes).toHaveLength(1)
  })

  it('keeps at most one request in flight', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.session.enable(f.layout)
    f.session.requestGeometry(f.request(), f.peer)
    f.advance(50)
    expect(f.session.requestGeometry(f.request({ sequence: 2 }), f.peer)).toBe(false)
    expect(f.replies().at(-1)?.reason).toBe('request-in-flight')
    expect(f.window.writes).toHaveLength(1)
  })

  it.each(['move', 'resize'] as const)('yields to user %s operations', (operation) => {
    const f = fixture()
    f.window[operation] = true
    f.session.enable(f.layout)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.replies()[0]?.reason).toBe('user-manipulation')
    expect(f.window.writes).toEqual([])
  })

  it('honors compositor resize restrictions', () => {
    const f = fixture()
    f.window.resizeable = false
    f.session.enable(f.layout)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.replies()[0]?.reason).toBe('compositor-disallows-geometry')
    expect(f.window.writes).toEqual([])
  })

  it('disconnects sampling immediately and cancels pending work on disable', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.session.enable(f.layout)
    f.session.requestGeometry(f.request(), f.peer)
    f.session.disable('user-disabled')
    expect(f.replies()[0]).toMatchObject({ outcome: 'cancelled', reason: 'user-disabled' })
    expect(f.pointers().at(-1)).toBeNull()
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.frameGeometryChanged.handlers.size).toBe(0)
    expect(f.workspace.screens[0].geometryChanged.handlers.size).toBe(0)
    expect(f.session.enable(f.layout)).toBe(false)
    f.window.settle({ x: 120, y: 100, width: 220, height: 300 })
    expect(f.replies()).toHaveLength(1)
  })

  it.each(['screensChanged', 'scaleChanged', 'geometryChanged'] as const)('invalidates the session immediately on %s', (signal) => {
    const f = fixture()
    f.session.enable(f.layout)
    if (signal === 'screensChanged')
      f.workspace.screensChanged.emit()
    else
      f.workspace.screens[0][signal].emit()
    expect(f.pointers().at(-1)).toBeNull()
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.observations.at(-1)).toEqual({ type: 'disabled', reason: 'output-layout-changed' })
  })

  it('rechecks panel work areas before every geometry write', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.workspace.clientArea.mockReturnValue({ x: 0, y: 80, width: 1920, height: 1000 })
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.replies().at(-1)?.reason).toBe('work-area-changed')
    expect(f.window.writes).toEqual([])
    expect(f.workspace.clientArea).toHaveBeenCalledWith(777, f.workspace.screens[1], f.workspace.currentDesktop)
  })

  it('rejects old layout revisions after an explicitly refreshed work area', () => {
    const f = fixture()
    f.session.enable(f.layout)
    expect(f.session.replaceLayout({ ...f.layout, revision: 2 })).toBe(true)
    expect(f.session.replaceLayout(f.layout)).toBe(false)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
    expect(f.replies()[0]?.reason).toBe('layout-mismatch')
  })

  it('expires parent leases even when a late heartbeat arrives first', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.advance(1000)
    expect(f.session.heartbeat(f.peer, f.process)).toBe(false)
    expect(f.pointers().at(-1)).toBeNull()
    expect(f.window.writes).toEqual([])
  })

  it('extends leases only for the verified KWin owner and enrolled process birth identity', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.advance(500)
    expect(f.session.heartbeat({ ...f.peer, uid: 999 }, f.process)).toBe(false)
    expect(f.session.heartbeat(f.peer, f.process)).toBe(true)
    f.advance(600)
    f.session.tick()
    expect(f.pointers().at(-1)?.capturedAtMs).toBe(2100)
    expect(f.session.heartbeat(f.peer, { ...f.process, birthId: 'reused-pid' })).toBe(false)
    expect(f.pointers().at(-1)).toBeNull()
  })

  it.each(['pid', 'internalId', 'resourceClass', 'deleted'] as const)('revokes changed window identity field %s', (field) => {
    const f = fixture()
    f.session.enable(f.layout)
    if (field === 'pid')
      f.window.pid = 999
    else if (field === 'deleted')
      f.window.deleted = true
    else
      f.window[field] = 'recreated-window'
    f.session.tick()
    expect(f.pointers().at(-1)).toBeNull()
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
  })

  it('revokes permanently on compositor owner changes, window closure, or backwards clocks', () => {
    const owner = fixture()
    owner.session.enable(owner.layout)
    owner.session.ownerChanged(':1.99')
    expect(owner.session.heartbeat(owner.peer, owner.process)).toBe(false)
    const closed = fixture()
    closed.session.enable(closed.layout)
    closed.window.closed.emit()
    expect(closed.session.requestGeometry(closed.request(), closed.peer)).toBe(false)
    const clock = fixture()
    clock.session.enable(clock.layout)
    clock.advance(-1)
    clock.session.tick()
    expect(clock.observations.at(-1)).toEqual({ type: 'disabled', reason: 'clock-reset' })
  })

  it('fails closed and disconnects if observation delivery fails', () => {
    const f = fixture()
    f.session.enable(f.layout)
    f.publish.mockImplementation(() => {
      throw new Error('closed pipe')
    })
    f.advance(50)
    f.session.tick()
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.session.requestGeometry(f.request(), f.peer)).toBe(false)
  })

  it('rejects duplicate output IDs, invalid work areas, and unsupported scale data', () => {
    const f = fixture()
    expect(f.session.enable({ ...f.layout, outputs: [f.layout.outputs[0], f.layout.outputs[0]] })).toBe(false)
    expect(f.session.enable({ ...f.layout, outputs: [{ ...f.layout.outputs[0], workArea: { x: 0, y: 0, width: 100, height: 100 } }] })).toBe(false)
    expect(f.session.enable({ ...f.layout, outputs: [{ ...f.layout.outputs[0], scale: Number.POSITIVE_INFINITY }] })).toBe(false)
    expect(f.window.writes).toEqual([])
  })
})
