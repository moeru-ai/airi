import type { BusPeer, ProcessIdentity } from './caller-scope'
import type { Window, Workspace } from './kwin-api'
import type { GeometryReply, GeometryRequest, Layout, PointerSample, Rectangle } from './protocol'

import { safeParse } from 'valibot'

import { CallerScope } from './caller-scope'
import { containsPoint, containsRectangle, decodeGeometryRequest, layoutSchema, rectangleSchema } from './protocol'

/** Main creates this binding after checking a known AIRI surface and its Wayland connection process. */
export interface Enrollment {
  sessionId: string
  surfaceId: string
  windowId: string
  resourceClass: string
  process: ProcessIdentity
}

/** Internal observations feed the central Eventa contracts after the native transport verifies its caller. */
export type Observation
  = | { type: 'pointer', sample: PointerSample | null }
    | { type: 'layout', layout: Layout | null }
    | { type: 'geometry', reply: GeometryReply }
    | { type: 'disabled', reason: string }

/**
 * One session owns one enrolled window and one geometry request at a time.
 * Idle becomes active once. Disable is terminal and disconnects every owned signal synchronously.
 * Clock rollback, stale parent leases, layout changes, and identity changes invalidate in-flight work.
 */
export class CompanionSession {
  private state: 'idle' | 'active' | 'disabled' = 'idle'
  private layout: Layout | null = null
  private revision = 0
  private sequence = 0
  private requestSequence = 0
  private lastNow = 0
  private lastSampleAt = Number.NEGATIVE_INFINITY
  private lastGeometryAt = Number.NEGATIVE_INFINITY
  private leaseUntil = 0
  private pending: { request: GeometryRequest, deadline: number } | null = null
  private readonly disconnect: Array<() => void> = []
  private readonly binding: Enrollment
  private readonly scope: CallerScope

  constructor(
    private readonly workspace: Workspace,
    private readonly window: Window,
    binding: Enrollment,
    owner: BusPeer,
    private readonly now: () => number,
    private readonly publish: (event: Observation) => void,
    private readonly workAreaOption: number,
  ) {
    if (![binding.sessionId, binding.surfaceId, binding.windowId, binding.resourceClass].every(value => value.length > 0 && value.length <= 128))
      throw new Error('Invalid surface enrollment')
    this.binding = { ...binding, process: { ...binding.process } }
    this.scope = new CallerScope(owner, this.binding.process)
  }

  /** An explicit main-process enable action starts sampling. Construction alone has no desktop effects. */
  enable(layout: Layout): boolean {
    if (this.state !== 'idle' || !this.identityMatches())
      return false
    const now = this.readClock()
    if (now === null || !this.replaceLayout(layout))
      return false
    this.state = 'active'
    this.leaseUntil = now + 1000
    this.connect(this.workspace.cursorPosChanged, () => this.tick())
    this.connect(this.workspace.screensChanged, () => this.invalidateLayout())
    this.connect(this.workspace.currentDesktopChanged, () => this.invalidateLayout())
    for (const output of this.workspace.screens) {
      this.connect(output.geometryChanged, () => this.invalidateLayout())
      this.connect(output.scaleChanged, () => this.invalidateLayout())
    }
    this.connect(this.window.frameGeometryChanged, () => this.acknowledgeGeometry())
    this.connect(this.window.closed, () => this.disable('surface-closed'))
    this.tick()
    return this.state === 'active'
  }

  /** A verified helper heartbeat extends the lease. Payload-supplied PID claims must never call this method. */
  heartbeat(peer: BusPeer, process: ProcessIdentity): boolean {
    if (!this.scope.accepts(peer))
      return false
    const now = this.readClock()
    if (now === null || !this.scope.processMatches(process)) {
      this.disable('identity-revoked')
      return false
    }
    // A late heartbeat cannot revive a lease after an event-loop pause or machine suspend.
    if (this.state !== 'active' || now >= this.leaseUntil) {
      this.disable('parent-lease-expired')
      return false
    }
    this.leaseUntil = now + 1000
    return true
  }

  /** The transport calls this immediately for KWin bus owner changes, including disappearance. */
  ownerChanged(uniqueOwner: string): void {
    this.scope.ownerChanged(uniqueOwner)
    this.disable('compositor-owner-changed')
  }

  /** The script captures a fresh revision after output changes. Old requests remain invalid. */
  replaceLayout(input: Layout): boolean {
    const result = safeParse(layoutSchema, input)
    if (this.state === 'disabled' || !result.success || result.output.revision <= this.revision)
      return false
    const layout = result.output
    if (!layout.outputs.every(output => containsRectangle(output.bounds, output.workArea)))
      return false
    this.cancelPending('layout-changed')
    this.layout = layout
    this.revision = layout.revision
    return this.emit({ type: 'pointer', sample: null }) && this.emit({ type: 'layout', layout })
  }

  /** Run from QTimer at 50 ms. Cursor signals can also call this method without exceeding 20 samples per second. */
  tick(): void {
    const now = this.checkActive()
    if (now === null)
      return
    if (this.pending && now >= this.pending.deadline) {
      const request = this.pending.request
      this.pending = null
      this.reply(request, 'unconfirmed', 'geometry-timeout')
      this.disable('geometry-timeout')
      return
    }
    if (!this.layout || now - this.lastSampleAt < 50)
      return
    this.lastSampleAt = now
    const point = this.workspace.cursorPos
    const output = this.layout.outputs.find(output => containsPoint(output.bounds, point))
    if (!output || !Number.isFinite(point.x) || !Number.isFinite(point.y)) {
      this.emit({ type: 'pointer', sample: null })
      return
    }
    this.emit({
      type: 'pointer',
      sample: {
        coordinateSpace: 'kwin-logical-desktop',
        source: 'kwin-companion-experiment',
        sessionId: this.binding.sessionId,
        sequence: ++this.sequence,
        layoutRevision: this.layout.revision,
        capturedAtMs: now,
        position: { x: point.x, y: point.y },
        outputId: output.id,
      },
    })
  }

  /** Validated frames arrive only through the authenticated helper path, never through renderer IPC. */
  requestGeometry(frame: string, peer: BusPeer): boolean {
    if (!this.scope.accepts(peer))
      return false
    const now = this.checkActive()
    const request = decodeGeometryRequest(frame)
    if (now === null || !request)
      return false
    if (request.sessionId !== this.binding.sessionId || request.surfaceId !== this.binding.surfaceId)
      return false
    if (request.sequence <= this.requestSequence) {
      this.reply(request, 'rejected', 'replayed-sequence')
      return false
    }
    this.requestSequence = request.sequence
    const reject = (reason: string) => {
      this.reply(request, 'rejected', reason)
      return false
    }
    if (!this.layout || request.layoutRevision !== this.layout.revision)
      return reject('layout-mismatch')
    if (now < request.createdAtMs || now - request.createdAtMs > 250)
      return reject('request-stale')
    if (this.pending)
      return reject('request-in-flight')
    if (now - this.lastGeometryAt < 50)
      return reject('request-rate-limit')
    if (this.window.move || this.window.resize)
      return reject('user-manipulation')
    const current = this.window.frameGeometry
    if (!safeParse(rectangleSchema, current).success)
      return reject('surface-geometry-invalid')
    const moving = current.x !== request.bounds.x || current.y !== request.bounds.y
    const resizing = current.width !== request.bounds.width || current.height !== request.bounds.height
    if ((moving && !this.window.moveable) || (resizing && !this.window.resizeable))
      return reject('compositor-disallows-geometry')
    const output = this.layout.outputs.find(output => containsRectangle(output.workArea, current))
    if (!output || !containsRectangle(output.workArea, request.bounds))
      return reject('outside-current-work-area')
    const liveOutput = this.workspace.screens.find(screen => screen.name === output.id)
    if (!liveOutput) {
      this.invalidateLayout()
      return reject('output-removed')
    }
    let workArea: Rectangle
    try {
      workArea = this.workspace.clientArea(this.workAreaOption, liveOutput, this.workspace.currentDesktop)
    }
    catch {
      this.disable('work-area-read-failed')
      return reject('work-area-read-failed')
    }
    if (!safeParse(rectangleSchema, workArea).success || !sameRectangle(workArea, output.workArea)) {
      this.invalidateLayout()
      return reject('work-area-changed')
    }
    if (Math.hypot(request.bounds.x - current.x, request.bounds.y - current.y) > 32
      || Math.abs(request.bounds.width - current.width) > 256 || Math.abs(request.bounds.height - current.height) > 256) {
      return reject('step-limit')
    }
    this.lastGeometryAt = now
    this.pending = { request, deadline: now + 300 }
    try {
      this.window.frameGeometry = { ...request.bounds }
      this.acknowledgeGeometry()
    }
    catch {
      if (this.pending) {
        this.pending = null
        this.reply(request, 'unconfirmed', 'geometry-write-failed')
      }
      this.disable('geometry-write-failed')
      return false
    }
    return this.state === 'active'
  }

  /** No geometry is changed during disable. The last acknowledged position stays available through ordinary AIRI controls. */
  disable(reason: string): void {
    if (this.state === 'disabled')
      return
    this.state = 'disabled'
    this.scope.revoke()
    for (const disconnect of this.disconnect.splice(0))
      disconnect()
    this.cancelPending(reason)
    this.layout = null
    this.emit({ type: 'pointer', sample: null })
    this.emit({ type: 'disabled', reason })
  }

  private connect(signal: Window['closed'], handler: () => void): void {
    signal.connect(handler)
    this.disconnect.push(() => signal.disconnect(handler))
  }

  private invalidateLayout(): void {
    if (this.state !== 'active')
      return
    this.cancelPending('layout-changed')
    this.layout = null
    this.emit({ type: 'pointer', sample: null })
    this.emit({ type: 'layout', layout: null })
    // Hotplug replaces output objects. Stop until explicit re-enrollment connects their signals.
    this.disable('output-layout-changed')
  }

  private identityMatches(): boolean {
    return this.window.managed && !this.window.deleted
      && String(this.window.internalId) === this.binding.windowId
      && this.window.pid === this.binding.process.pid
      && String(this.window.resourceClass) === this.binding.resourceClass
  }

  private readClock(): number | null {
    const now = this.now()
    if (!Number.isFinite(now) || now < this.lastNow) {
      this.disable('clock-reset')
      return null
    }
    this.lastNow = now
    return now
  }

  private checkActive(): number | null {
    if (this.state !== 'active')
      return null
    const now = this.readClock()
    if (now === null)
      return null
    if (!this.identityMatches()) {
      this.disable('surface-identity-changed')
      return null
    }
    if (now >= this.leaseUntil) {
      this.disable('parent-lease-expired')
      return null
    }
    return now
  }

  private acknowledgeGeometry(): void {
    const now = this.checkActive()
    if (now === null || !this.pending)
      return
    if (now >= this.pending.deadline) {
      this.tick()
      return
    }
    const request = this.pending.request
    const observed = this.window.frameGeometry
    if (Math.abs(observed.x - request.bounds.x) <= 0.5 && Math.abs(observed.y - request.bounds.y) <= 0.5
      && Math.abs(observed.width - request.bounds.width) <= 0.5 && Math.abs(observed.height - request.bounds.height) <= 0.5) {
      this.pending = null
      this.reply(request, 'applied', 'geometry-observed')
    }
  }

  private cancelPending(reason: string): void {
    if (!this.pending)
      return
    const request = this.pending.request
    this.pending = null
    this.reply(request, 'cancelled', reason)
  }

  private reply(request: GeometryRequest, outcome: GeometryReply['outcome'], reason: string): void {
    const observed = safeParse(rectangleSchema, this.window.frameGeometry)
    this.emit({
      type: 'geometry',
      reply: {
        requestId: request.requestId,
        sessionId: this.binding.sessionId,
        layoutRevision: this.revision,
        outcome,
        reason,
        observedBounds: observed.success ? observed.output : null,
      },
    })
  }

  private emit(event: Observation): boolean {
    try {
      this.publish(event)
      return true
    }
    catch {
      // Lost delivery revokes control without recursive error events or unattended retries.
      this.state = 'disabled'
      this.scope.revoke()
      this.pending = null
      this.layout = null
      for (const disconnect of this.disconnect.splice(0))
        disconnect()
      return false
    }
  }
}

function sameRectangle(left: Rectangle, right: Rectangle): boolean {
  return left.x === right.x && left.y === right.y && left.width === right.width && left.height === right.height
}
