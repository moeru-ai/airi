import type { Observation } from '../src/companion-session'
import type { Signal, Window, Workspace } from '../src/kwin-api'
import type { GeometryRequest, Layout, Rectangle } from '../src/protocol'
import type { ScriptRuntime, ScriptTimer, TrustedEnrollment } from '../src/script-exchange'

import { describe, expect, it, vi } from 'vitest'

import { ScriptExchange } from '../src/script-exchange'

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
  internalId = 'enrolled-window'
  pid = 440
  resourceClass = 'airi-test'
  managed = true
  deleted = false
  move = false
  resize = false
  moveable = true
  resizeable = true
  appliesImmediately = true
  readonly frameGeometryChanged = new TestSignal()
  readonly closed = new TestSignal()
  readonly writes: Rectangle[] = []
  current: Rectangle = { x: 100, y: 100, width: 200, height: 300 }

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

function fixture(options: { enrollment?: boolean, helperOwner?: string } = {}) {
  let now = 1000
  const timers: TestTimer[] = []
  class TestTimer implements ScriptTimer {
    interval = 0
    singleShot = false
    running = false
    starts = 0
    readonly timeout = new TestSignal()

    constructor() {
      timers.push(this)
    }

    start(): void {
      this.starts++
      this.running = true
    }

    stop(): void {
      this.running = false
    }

    fire(): void {
      if (!this.running)
        return
      if (this.singleShot)
        this.running = false
      this.timeout.emit()
    }
  }
  const window = new TestWindow()
  const layout: Layout = {
    coordinateSpace: 'kwin-logical-desktop',
    revision: 1,
    outputs: [{
      id: 'main',
      bounds: { x: 0, y: 0, width: 1920, height: 1080 },
      workArea: { x: 0, y: 40, width: 1920, height: 1040 },
      scale: 1.25,
    }],
  }
  const workspace = {
    cursorPos: { x: 160, y: 200 },
    cursorPosChanged: new TestSignal(),
    screensChanged: new TestSignal(),
    currentDesktop: { id: 'desktop-1' },
    currentDesktopChanged: new TestSignal(),
    clientArea: vi.fn(() => ({ ...layout.outputs[0].workArea })),
    screens: [{
      name: 'main',
      geometry: layout.outputs[0].bounds,
      devicePixelRatio: 1.25,
      geometryChanged: new TestSignal(),
      scaleChanged: new TestSignal(),
    }],
  } satisfies Workspace
  const enrollment: TrustedEnrollment = {
    helperOwner: options.helperOwner ?? ':1.55',
    kwinPeer: { uniqueOwner: ':1.42', uid: 1000, pid: 400 },
    binding: {
      sessionId: 'session-one',
      surfaceId: 'main-stage',
      windowId: window.internalId,
      resourceClass: window.resourceClass,
      process: { pid: window.pid, birthId: 'verified-start-1234' },
    },
    window,
    layout,
  }
  const calls: Array<{ frame: string, callback: (...reply: unknown[]) => void }> = []
  const callDBus = vi.fn<ScriptRuntime['callDBus']>((_owner, _path, _interface, _method, frame, callback) => {
    calls.push({ frame, callback })
  })
  const runtime: ScriptRuntime = { workspace, workAreaOption: 777, QTimer: TestTimer, now: () => now, callDBus }
  const observations: Observation[] = []
  const publish = vi.fn((event: Observation) => {
    observations.push(event)
  })
  const exchange = new ScriptExchange(runtime, options.enrollment === false ? null : enrollment, publish)
  const advance = (milliseconds: number) => {
    now += milliseconds
  }
  const response = (changes: Record<string, unknown> = {}, call = calls.length - 1) => {
    const request = JSON.parse(calls[call].frame)
    return JSON.stringify({
      version: 1,
      kind: request.kind === 'hello' ? 'ready' : 'poll',
      sessionId: request.sessionId,
      exchangeSequence: request.exchangeSequence,
      layoutRevision: request.layoutRevision,
      status: 'active',
      reason: '',
      command: null,
      ...changes,
    })
  }
  const reply = (changes: Record<string, unknown> = {}, call = calls.length - 1) => calls[call].callback(response(changes, call))
  const activate = () => {
    expect(exchange.start()).toBe(true)
    reply()
  }
  const poll = (milliseconds = 50) => {
    advance(milliseconds)
    timers[1].fire()
  }
  const command = (changes: Partial<GeometryRequest> = {}): GeometryRequest => ({
    version: 1,
    sessionId: enrollment.binding.sessionId,
    surfaceId: enrollment.binding.surfaceId,
    requestId: 'move-1',
    sequence: 1,
    layoutRevision: layout.revision,
    createdAtMs: now,
    bounds: { x: 120, y: 100, width: 200, height: 300 },
    ...changes,
  })
  const disabledReason = () => [...observations].reverse().find(event => event.type === 'disabled')?.reason
  return { exchange, enrollment, runtime, workspace, window, layout, timers, calls, callDBus, publish, observations, advance, response, reply, activate, poll, command, disabledReason }
}

describe('bounded KWin script exchange', () => {
  it('has no timer, bus call, or sampling before explicit start', () => {
    const f = fixture()
    expect(f.timers).toEqual([])
    expect(f.callDBus).not.toHaveBeenCalled()
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.writes).toEqual([])
  })

  it('fails closed without trusted enrollment or a pinned unique helper owner', () => {
    for (const options of [{ enrollment: false }, { helperOwner: 'org.airi.Companion' }]) {
      const f = fixture(options)
      expect(f.exchange.start()).toBe(false)
      expect(f.callDBus).not.toHaveBeenCalled()
      expect(f.timers).toEqual([])
      expect(f.disabledReason()).toBe('enrollment-unavailable')
      expect(f.exchange.start()).toBe(false)
    }
  })

  it('sends only the enrolled hello through the pinned service and exact method', () => {
    const f = fixture()
    expect(f.exchange.start()).toBe(true)
    expect(JSON.parse(f.calls[0].frame)).toEqual({
      version: 1,
      kind: 'hello',
      sessionId: 'session-one',
      exchangeSequence: 1,
      layoutRevision: 1,
      windowId: 'enrolled-window',
      layout: f.layout,
    })
    expect(f.callDBus).toHaveBeenCalledWith(':1.55', '/org/airi/Companion', 'org.airi.Companion1', 'Exchange', f.calls[0].frame, expect.any(Function))
    expect(f.timers).toHaveLength(1)
    expect(f.timers[0].interval).toBe(1000)
    expect(f.timers[0].singleShot).toBe(true)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.observations).toEqual([])
  })

  it('starts 50 ms sampling only after a correlated active ready reply', () => {
    const f = fixture()
    f.activate()
    expect(f.timers).toHaveLength(2)
    expect(f.timers[1].interval).toBe(50)
    expect(f.timers[1].singleShot).toBe(false)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(1)
    f.poll()
    expect(JSON.parse(f.calls[1].frame)).toEqual({
      version: 1,
      kind: 'poll',
      sessionId: 'session-one',
      exchangeSequence: 2,
      layoutRevision: 1,
      sample: {
        coordinateSpace: 'kwin-logical-desktop',
        source: 'kwin-companion-experiment',
        sessionId: 'session-one',
        sequence: 2,
        layoutRevision: 1,
        capturedAtMs: 1050,
        position: { x: 160, y: 200 },
        outputId: 'main',
      },
      ack: null,
    })
  })

  it('retains one in-flight call while replacing old samples with the newest position', () => {
    const f = fixture()
    f.activate()
    f.poll()
    for (let index = 0; index < 10; index++) {
      f.workspace.cursorPos = { x: 180 + index, y: 200 }
      f.poll()
    }
    expect(f.calls).toHaveLength(2)
    f.reply()
    expect(f.calls).toHaveLength(2)
    f.poll()
    expect(f.calls).toHaveLength(3)
    expect(JSON.parse(f.calls[2].frame).sample.position).toEqual({ x: 189, y: 200 })
  })

  it('waits 50 ms after a delayed reply before sending the next poll', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.advance(40)
    f.reply()
    f.poll(10)
    expect(f.calls).toHaveLength(2)
    f.poll()
    expect(f.calls).toHaveLength(3)
    expect(JSON.parse(f.calls[2].frame).sample.capturedAtMs).toBe(1150)
    expect(f.disabledReason()).toBeUndefined()
  })

  it('continues geometry readback while the next exchange waits for reply spacing', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.activate()
    f.poll()
    f.advance(40)
    f.reply({ command: f.command() })
    f.poll(10)
    expect(f.calls).toHaveLength(2)
    f.window.settle({ x: 120, y: 100, width: 200, height: 300 })
    f.poll()
    expect(JSON.parse(f.calls[2].frame).ack).toMatchObject({
      requestId: 'move-1',
      outcome: 'applied',
      observedBounds: f.window.current,
    })
    expect(f.disabledReason()).toBeUndefined()
  })

  it('does not replay a sample when a coarse timer fires before the next exchange interval', () => {
    const f = fixture()
    f.activate()
    f.poll()
    expect(JSON.parse(f.calls[1].frame).sample.sequence).toBe(2)
    f.reply()
    f.poll(49)
    expect(f.calls).toHaveLength(2)
    f.poll(51)
    expect(JSON.parse(f.calls[2].frame).sample.sequence).toBe(3)
    expect(f.disabledReason()).toBeUndefined()
  })

  it('keeps the newest in-flight position through a deferred exchange', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.advance(50)
    f.workspace.cursorPos = { x: 190, y: 220 }
    f.workspace.cursorPosChanged.emit()
    f.reply()
    f.poll(49)
    expect(f.calls).toHaveLength(2)
    f.poll(51)
    expect(JSON.parse(f.calls[2].frame).sample).toMatchObject({
      sequence: 4,
      capturedAtMs: 1200,
      position: { x: 190, y: 220 },
    })
    expect(f.disabledReason()).toBeUndefined()
  })

  it('expires a handshake when KWin omits the D-Bus error callback', () => {
    const f = fixture()
    f.exchange.start()
    f.advance(1000)
    f.timers[0].fire()
    expect(f.disabledReason()).toBe('helper-lease-expired')
    expect(f.calls).toHaveLength(1)
    expect(f.exchange.start()).toBe(false)
    f.reply()
    expect(f.timers).toHaveLength(1)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
  })

  it('expires a blocked poll through the independent watchdog without cadence ticks', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.advance(950)
    f.timers[0].fire()
    expect(f.disabledReason()).toBe('helper-lease-expired')
    expect(f.timers.every(timer => !timer.running)).toBe(true)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.frameGeometryChanged.handlers.size).toBe(0)
    expect(f.calls).toHaveLength(2)
  })

  it('rejects late replies before the delayed watchdog event can run', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.advance(950)
    f.reply({ command: f.command() })
    expect(f.disabledReason()).toBe('helper-lease-expired')
    expect(f.window.writes).toEqual([])
    expect(f.timers[0].starts).toBe(2)
  })

  it('refreshes both controller and transport leases only on accepted replies', () => {
    const f = fixture()
    f.activate()
    for (let index = 0; index < 4; index++) {
      f.poll(600)
      f.reply()
    }
    expect(f.disabledReason()).toBeUndefined()
    expect(f.calls).toHaveLength(5)
    expect(f.timers[0].starts).toBe(6)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(1)
  })

  it('does not let duplicate callbacks complete a later exchange or renew its lease', () => {
    const f = fixture()
    f.activate()
    f.poll()
    const starts = f.timers[0].starts
    f.reply({}, 0)
    expect(f.timers[0].starts).toBe(starts)
    f.poll()
    expect(f.calls).toHaveLength(2)
    f.reply()
    f.poll()
    expect(f.calls).toHaveLength(3)
  })

  it('stops synchronously on disable and ignores a later command reply', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.exchange.disable()
    f.reply({ command: f.command() })
    f.timers[1].timeout.emit()
    expect(f.window.writes).toEqual([])
    expect(f.calls).toHaveLength(2)
    expect(f.timers.every(timer => !timer.running && timer.timeout.handlers.size === 0)).toBe(true)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.observations.at(-2)).toEqual({ type: 'pointer', sample: null })
    expect(f.disabledReason()).toBe('user-disabled')
    expect(f.exchange.start()).toBe(false)
  })

  it.each([
    { version: 2 },
    { unknown: true },
    { kind: 'poll' },
    { sessionId: 'old-session' },
    { exchangeSequence: 2 },
    { layoutRevision: 2 },
    { status: 'active', reason: 'unexpected' },
    { status: 'disabled', reason: '' },
  ])('terminates on malformed or mismatched handshake fields: %j', (changes) => {
    const f = fixture()
    f.exchange.start()
    f.reply(changes)
    expect(f.disabledReason()).toBeDefined()
    expect(f.timers).toHaveLength(1)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.exchange.start()).toBe(false)
  })

  it.each([null, '{}', '{', 'x'.repeat(8193), `"${'界'.repeat(3000)}"`, '"\uD800"'])('rejects non-string, invalid, or byte-oversized replies', (reply) => {
    const f = fixture()
    f.exchange.start()
    f.calls[0].callback(reply)
    expect(f.disabledReason()).toBe('invalid-exchange-response')
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.exchange.start()).toBe(false)
  })

  it('requires exactly one D-Bus return value', () => {
    const missing = fixture()
    missing.exchange.start()
    missing.calls[0].callback()
    expect(missing.disabledReason()).toBe('invalid-exchange-response')
    const extra = fixture()
    extra.exchange.start()
    extra.calls[0].callback(extra.response(), 'extra-return-value')
    expect(extra.disabledReason()).toBe('invalid-exchange-response')
    expect(extra.workspace.cursorPosChanged.handlers.size).toBe(0)
  })

  it('rejects a ready command before connecting cursor or window signals', () => {
    const f = fixture()
    f.exchange.start()
    f.reply({ command: f.command() })
    expect(f.disabledReason()).toBe('mismatched-exchange-response')
    expect(f.window.writes).toEqual([])
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
  })

  it('terminates on an explicit helper disable without retrying', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.reply({ status: 'disabled', reason: 'parent-lease-expired' })
    f.poll()
    expect(f.disabledReason()).toBe('parent-lease-expired')
    expect(f.calls).toHaveLength(2)
    expect(f.exchange.start()).toBe(false)
  })

  it('applies one validated command and sends its observed acknowledgement on the next poll', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.reply({ command: f.command() })
    expect(f.window.writes).toEqual([{ x: 120, y: 100, width: 200, height: 300 }])
    f.poll()
    expect(JSON.parse(f.calls[2].frame).ack).toEqual({
      requestId: 'move-1',
      sessionId: 'session-one',
      layoutRevision: 1,
      outcome: 'applied',
      reason: 'geometry-observed',
      observedBounds: f.window.current,
    })
    f.reply()
    f.poll()
    expect(JSON.parse(f.calls[3].frame).ack).toBeNull()
  })

  it('waits for geometry readback and rejects a second command while the first remains pending', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.activate()
    f.poll()
    f.reply({ command: f.command() })
    f.poll()
    expect(JSON.parse(f.calls[2].frame).ack).toBeNull()
    f.reply({ command: f.command({ sequence: 2, requestId: 'move-2' }) })
    expect(f.disabledReason()).toBe('invalid-exchange-command')
    expect(f.window.writes).toHaveLength(1)
  })

  it('keeps an asynchronous acknowledgement until the current exchange completes', () => {
    const f = fixture()
    f.window.appliesImmediately = false
    f.activate()
    f.poll()
    f.reply({ command: f.command() })
    f.poll()
    f.window.settle({ x: 120, y: 100, width: 200, height: 300 })
    expect(JSON.parse(f.calls[2].frame).ack).toBeNull()
    f.reply()
    f.poll()
    expect(JSON.parse(f.calls[3].frame).ack.outcome).toBe('applied')
  })

  it.each([{ sessionId: 'other' }, { surfaceId: 'other' }, { layoutRevision: 2 }])('rejects command scope changes: %j', (changes) => {
    const f = fixture()
    f.activate()
    f.poll()
    f.reply({ command: f.command(changes) })
    expect(f.disabledReason()).toBe('invalid-exchange-command')
    expect(f.window.writes).toEqual([])
  })

  it('rejects replayed command sequences even after the previous acknowledgement was sent', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.reply({ command: f.command() })
    f.poll()
    f.reply({ command: f.command() })
    expect(f.disabledReason()).toBe('invalid-exchange-command')
    expect(f.window.writes).toHaveLength(1)
  })

  it('uses controller safety checks for excessive movement and changed work areas', () => {
    const f = fixture()
    f.activate()
    f.poll()
    f.reply({ command: f.command({ bounds: { x: 200, y: 100, width: 200, height: 300 } }) })
    f.poll()
    expect(JSON.parse(f.calls[2].frame).ack.reason).toBe('step-limit')
    expect(f.window.writes).toEqual([])
    f.workspace.clientArea.mockReturnValue({ x: 0, y: 80, width: 1920, height: 1000 })
    f.reply({ command: f.command({ sequence: 2, requestId: 'move-2' }) })
    expect(f.disabledReason()).toBe('output-layout-changed')
    expect(f.window.writes).toEqual([])
  })

  it('stops transport immediately when the enrolled window closes or the output layout changes', () => {
    const closed = fixture()
    closed.activate()
    closed.window.closed.emit()
    expect(closed.disabledReason()).toBe('surface-closed')
    expect(closed.timers.every(timer => !timer.running)).toBe(true)
    const layout = fixture()
    layout.activate()
    layout.workspace.screensChanged.emit()
    expect(layout.disabledReason()).toBe('output-layout-changed')
    expect(layout.timers.every(timer => !timer.running)).toBe(true)
  })

  it('revokes a changed pinned helper owner without consulting a replacement service', () => {
    const f = fixture()
    f.activate()
    f.exchange.helperOwnerChanged(':1.55')
    expect(f.disabledReason()).toBeUndefined()
    f.exchange.helperOwnerChanged(':1.56')
    expect(f.disabledReason()).toBe('helper-owner-changed')
    expect(f.calls).toHaveLength(1)
    expect(f.exchange.start()).toBe(false)
  })

  it('rejects clock rollback and a changed window identity before applying a command', () => {
    const clock = fixture()
    clock.activate()
    clock.poll()
    clock.advance(-1)
    clock.reply({ command: clock.command() })
    expect(clock.disabledReason()).toBe('clock-reset')
    expect(clock.window.writes).toEqual([])
    const window = fixture()
    window.activate()
    window.poll()
    window.window.pid++
    window.reply({ command: window.command() })
    expect(window.disabledReason()).toBe('surface-identity-changed')
    expect(window.window.writes).toEqual([])
  })

  it('stops after call exceptions without leaving a timer or retry', () => {
    const f = fixture()
    f.callDBus.mockImplementation(() => {
      throw new Error('Native call failed')
    })
    expect(f.exchange.start()).toBe(false)
    expect(f.disabledReason()).toBe('exchange-call-failed')
    expect(f.timers[0].running).toBe(false)
    expect(f.timers[0].timeout.handlers.size).toBe(0)
    expect(f.callDBus).toHaveBeenCalledTimes(1)
  })

  it('fails closed when observation delivery throws during handshake activation', () => {
    const f = fixture()
    f.exchange.start()
    f.publish.mockImplementation(() => {
      throw new Error('Closed observer')
    })
    f.reply()
    expect(f.timers).toHaveLength(1)
    expect(f.timers[0].running).toBe(false)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.frameGeometryChanged.handlers.size).toBe(0)
    expect(f.exchange.start()).toBe(false)
  })

  it('honors reentrant disable during activation without reconnecting controller signals', () => {
    const f = fixture()
    f.exchange.start()
    f.publish.mockImplementation(() => f.exchange.disable())
    f.reply()
    expect(f.timers).toHaveLength(1)
    expect(f.timers[0].running).toBe(false)
    expect(f.workspace.cursorPosChanged.handlers.size).toBe(0)
    expect(f.window.frameGeometryChanged.handlers.size).toBe(0)
    expect(f.exchange.start()).toBe(false)
  })

  it('reports terminal state if native controller signal cleanup throws', () => {
    const f = fixture()
    f.activate()
    vi.spyOn(f.workspace.cursorPosChanged, 'disconnect').mockImplementation(() => {
      throw new Error('Native object destroyed')
    })
    expect(() => f.exchange.disable()).not.toThrow()
    f.workspace.cursorPosChanged.emit()
    f.window.frameGeometryChanged.emit()
    expect(f.disabledReason()).toBe('user-disabled')
    expect(f.timers.every(timer => !timer.running)).toBe(true)
    expect(f.window.writes).toEqual([])
    expect(f.calls).toHaveLength(1)
  })

  it('fails closed when the native clock cannot be read', () => {
    const f = fixture()
    f.activate()
    f.poll()
    vi.spyOn(f.runtime, 'now').mockImplementation(() => {
      throw new Error('Clock unavailable')
    })
    expect(() => f.reply({ command: f.command() })).not.toThrow()
    expect(f.disabledReason()).toBe('clock-read-failed')
    expect(f.timers.every(timer => !timer.running)).toBe(true)
    expect(f.window.writes).toEqual([])
  })

  it('checks the serialized UTF-8 byte limit before calling D-Bus', () => {
    const f = fixture()
    f.layout.outputs = Array.from({ length: 32 }, (_, index) => ({
      ...f.layout.outputs[0],
      id: `${index}${'界'.repeat(120)}`,
    }))
    expect(f.exchange.start()).toBe(false)
    expect(f.disabledReason()).toBe('exchange-frame-too-large')
    expect(f.callDBus).not.toHaveBeenCalled()
    expect(f.timers[0].running).toBe(false)
  })
})
