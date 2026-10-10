import type { BusPeer } from './caller-scope'
import type { Enrollment, Observation } from './companion-session'
import type { Signal, Window, Workspace } from './kwin-api'
import type { GeometryReply, GeometryRequest, Layout, PointerSample } from './protocol'

import { finite, integer, literal, maxLength, maxValue, minLength, minValue, nullable, number, picklist, pipe, safeParse, strictObject, string, variant } from 'valibot'

import { CompanionSession } from './companion-session'
import { containsRectangle, geometryRequestSchema, layoutSchema, rectangleSchema } from './protocol'

const identifier = pipe(string(), minLength(1), maxLength(128))
const counter = pipe(number(), integer(), minValue(1), maxValue(Number.MAX_SAFE_INTEGER))
const timestamp = pipe(number(), finite(), minValue(0), maxValue(Number.MAX_SAFE_INTEGER))
const coordinate = pipe(number(), finite(), minValue(-1_000_000), maxValue(1_000_000))
const sampleSchema = strictObject({
  coordinateSpace: literal('kwin-logical-desktop'),
  source: literal('kwin-companion-experiment'),
  sessionId: identifier,
  sequence: counter,
  layoutRevision: counter,
  capturedAtMs: timestamp,
  position: strictObject({ x: coordinate, y: coordinate }),
  outputId: identifier,
})
const acknowledgementSchema = strictObject({
  requestId: identifier,
  sessionId: identifier,
  layoutRevision: counter,
  outcome: picklist(['applied', 'rejected', 'cancelled', 'unconfirmed']),
  reason: pipe(string(), minLength(1), maxLength(128)),
  observedBounds: nullable(rectangleSchema),
})
const envelope = {
  version: literal(1),
  sessionId: identifier,
  exchangeSequence: counter,
  layoutRevision: counter,
}
const requestSchema = variant('kind', [
  strictObject({ ...envelope, kind: literal('hello'), windowId: identifier, layout: layoutSchema }),
  strictObject({ ...envelope, kind: literal('poll'), sample: nullable(sampleSchema), ack: nullable(acknowledgementSchema) }),
])
const responseSchema = strictObject({
  ...envelope,
  kind: picklist(['ready', 'poll']),
  status: picklist(['active', 'disabled']),
  reason: pipe(string(), maxLength(128)),
  command: nullable(geometryRequestSchema),
})

/** KWin owns these native timers. The exchange stops them and disconnects their handlers on every terminal transition. */
export interface ScriptTimer {
  interval: number
  singleShot: boolean
  readonly timeout: Signal
  start: () => void
  stop: () => void
}

/** These are KWin script globals, supplied explicitly so importing this module cannot contact a desktop. */
export interface ScriptRuntime {
  readonly workspace: Workspace
  readonly workAreaOption: number
  readonly QTimer: new () => ScriptTimer
  /** Nondecreasing milliseconds must match helper command timestamps. Native clock calibration remains a release gate. */
  readonly now: () => number
  readonly callDBus: (
    service: string,
    path: string,
    interfaceName: string,
    method: string,
    frame: string,
    callback: (...reply: unknown[]) => void,
  ) => void
}

/**
 * The trusted host supplies this only after proving native Wayland enrollment and pinning both bus owners.
 * JSON, title matching, and PID matching alone cannot establish this trust. Native enrollment remains an external release gate.
 */
export interface TrustedEnrollment {
  readonly helperOwner: string
  readonly kwinPeer: BusPeer
  readonly binding: Enrollment
  readonly window: Window
  readonly layout: Layout
}

/**
 * Idle becomes connecting once. A matching ready reply permits sampling. Disabled is terminal, including after malformed replies.
 * One outstanding sequence binds each callback to its session and layout. Late callbacks cannot renew leases or apply commands.
 * Pending samples collapse to the newest value. Acknowledgements occupy one slot and never overwrite another acknowledgement.
 */
export class ScriptExchange {
  private state: 'idle' | 'connecting' | 'active' | 'disabled' = 'idle'
  private enrollment: TrustedEnrollment | null = null
  private session: CompanionSession | null = null
  private sampleTimer: ScriptTimer | null = null
  private leaseTimer: ScriptTimer | null = null
  private readonly disconnect: Array<() => void> = []
  private inFlight: { sequence: number, kind: 'hello' | 'poll' } | null = null
  private sequence = 0
  private lastNow = 0
  private leaseUntil = 0
  private nextExchangeAt = 0
  private sample: PointerSample | null = null
  private acknowledgement: GeometryReply | null = null
  private pendingCommand: GeometryRequest | null = null
  private lastCommandSequence = 0
  private readonly onSampleTimer = () => this.poll()
  private readonly onLeaseTimer = () => this.disable('helper-lease-expired')

  constructor(
    private readonly runtime: ScriptRuntime,
    private readonly trustedEnrollment: TrustedEnrollment | null,
    private readonly publish: (event: Observation) => void,
  ) {}

  /** Explicit enable starts only the handshake watchdog. No cursor signals are connected before the helper accepts enrollment. */
  start(): boolean {
    if (this.state !== 'idle')
      return false
    const trusted = this.trustedEnrollment
    const layout = safeParse(layoutSchema, trusted?.layout)
    if (!trusted || !/^:\d+\.\d+$/.test(trusted.helperOwner) || !layout.success
      || !layout.output.outputs.every(output => containsRectangle(output.bounds, output.workArea))) {
      this.disable('enrollment-unavailable')
      return false
    }
    this.enrollment = {
      helperOwner: trusted.helperOwner,
      kwinPeer: { ...trusted.kwinPeer },
      binding: { ...trusted.binding, process: { ...trusted.binding.process } },
      window: trusted.window,
      layout: layout.output,
    }
    const now = this.readClock()
    if (now === null)
      return false
    try {
      this.session = new CompanionSession(
        this.runtime.workspace,
        trusted.window,
        this.enrollment.binding,
        this.enrollment.kwinPeer,
        this.runtime.now,
        event => this.observe(event),
        this.runtime.workAreaOption,
      )
      this.state = 'connecting'
      this.leaseUntil = now + 1000
      // KWin omits D-Bus error callbacks. Keep this watchdog independent of the asynchronous call.
      this.leaseTimer = new this.runtime.QTimer()
      this.leaseTimer.interval = 1000
      this.leaseTimer.singleShot = true
      this.connect(this.leaseTimer.timeout, this.onLeaseTimer)
      this.leaseTimer.start()
      this.send('hello')
      return !this.stopped
    }
    catch {
      this.disable('script-start-failed')
      return false
    }
  }

  /** A host ownership watch revokes the pinned helper immediately. Missing native watches still expire through the independent lease. */
  helperOwnerChanged(owner: string): void {
    if (owner !== this.enrollment?.helperOwner)
      this.disable('helper-owner-changed')
  }

  /** Stops timers before controller cleanup. Already submitted compositor operations cannot be cancelled by JavaScript. */
  disable(reason = 'user-disabled'): void {
    if (this.state === 'disabled')
      return
    this.state = 'disabled'
    this.inFlight = null
    this.sample = null
    this.acknowledgement = null
    this.pendingCommand = null
    for (const timer of [this.sampleTimer, this.leaseTimer]) {
      try {
        timer?.stop()
      }
      catch {
        // Terminal state also blocks queued timer callbacks when native timer cleanup fails.
      }
    }
    for (const disconnect of this.disconnect.splice(0)) {
      try {
        disconnect()
      }
      catch {
        // A disconnected native object cannot restart this terminal exchange.
      }
    }
    try {
      this.session?.disable(reason)
    }
    catch {
      // Controller state is terminal before its native cleanup. Report neutral state even if a destroyed signal rejects disconnect.
    }
    this.notify({ type: 'pointer', sample: null })
    this.notify({ type: 'disabled', reason })
  }

  private get stopped(): boolean {
    return this.state === 'disabled'
  }

  private poll(): void {
    if (this.state !== 'active' || this.checkLease() === null)
      return
    try {
      this.session?.tick()
      if (this.state === 'active' && !this.inFlight)
        this.send('poll')
    }
    catch {
      this.disable('script-poll-failed')
    }
  }

  private send(kind: 'hello' | 'poll'): void {
    const enrollment = this.enrollment
    if (!enrollment || this.state === 'disabled' || this.inFlight)
      return
    const now = this.checkLease()
    if (now === null || now < this.nextExchangeAt)
      return
    const common = {
      version: 1,
      sessionId: enrollment.binding.sessionId,
      exchangeSequence: ++this.sequence,
      layoutRevision: enrollment.layout.revision,
    }
    const request = kind === 'hello'
      ? { ...common, kind, windowId: enrollment.binding.windowId, layout: enrollment.layout }
      : { ...common, kind, sample: this.sample, ack: this.acknowledgement }
    const parsed = safeParse(requestSchema, request)
    if (!parsed.success) {
      this.disable('invalid-exchange-request')
      return
    }
    const frame = JSON.stringify(parsed.output)
    if (!withinFrameLimit(frame)) {
      this.disable('exchange-frame-too-large')
      return
    }
    if (kind === 'poll') {
      // Consume before dispatch. A coarse timer can skip sampling, and later observations must survive an in-flight call.
      this.sample = null
      this.acknowledgement = null
    }
    const pending = { sequence: this.sequence, kind }
    this.inFlight = pending
    try {
      this.runtime.callDBus(
        enrollment.helperOwner,
        '/org/airi/Companion',
        'org.airi.Companion1',
        'Exchange',
        frame,
        (...reply) => this.receive(pending, reply),
      )
    }
    catch {
      this.disable('exchange-call-failed')
    }
  }

  private receive(pending: { sequence: number, kind: 'hello' | 'poll' }, values: unknown[]): void {
    // Identity comparison rejects duplicate callbacks and callbacks from an exchange that ended during disable.
    if (this.state === 'disabled' || this.inFlight !== pending || this.checkLease() === null)
      return
    try {
      const frame = values[0]
      if (values.length !== 1 || typeof frame !== 'string' || !withinFrameLimit(frame)) {
        this.disable('invalid-exchange-response')
        return
      }
      const parsed = safeParse(responseSchema, JSON.parse(frame))
      const enrollment = this.enrollment
      if (!parsed.success || !enrollment) {
        this.disable('invalid-exchange-response')
        return
      }
      const reply = parsed.output
      if (reply.sessionId !== enrollment.binding.sessionId || reply.exchangeSequence !== pending.sequence
        || reply.layoutRevision !== enrollment.layout.revision || reply.kind !== (pending.kind === 'hello' ? 'ready' : 'poll')
        || (reply.kind === 'ready' && reply.command !== null)
        || (reply.status === 'active' && reply.reason !== '')
        || (reply.status === 'disabled' && (reply.command !== null || !reply.reason))) {
        this.disable('mismatched-exchange-response')
        return
      }
      if (reply.status === 'disabled') {
        this.disable(reply.reason)
        return
      }
      this.inFlight = null
      if (pending.kind === 'hello') {
        if (!this.session?.enable(enrollment.layout)) {
          this.disable('enrollment-rejected')
          return
        }
        this.state = 'active'
        this.sampleTimer = new this.runtime.QTimer()
        this.sampleTimer.interval = 50
        this.sampleTimer.singleShot = false
        this.connect(this.sampleTimer.timeout, this.onSampleTimer)
        this.sampleTimer.start()
      }
      else if (!this.session?.heartbeat(enrollment.kwinPeer, enrollment.binding.process)) {
        this.disable('session-lease-rejected')
        return
      }
      const now = this.checkLease()
      if (now === null)
        return
      this.leaseUntil = now + 1000
      // Reply spacing prevents delayed calls from arriving at the helper in a burst. Sampling remains independent.
      this.nextExchangeAt = now + 50
      this.leaseTimer?.start()
      if (reply.command)
        this.applyCommand(reply.command)
    }
    catch {
      this.disable('invalid-exchange-response')
    }
  }

  private applyCommand(command: GeometryRequest): void {
    const enrollment = this.enrollment
    if (!enrollment || command.sessionId !== enrollment.binding.sessionId || command.surfaceId !== enrollment.binding.surfaceId
      || command.layoutRevision !== enrollment.layout.revision || command.sequence <= this.lastCommandSequence
      || this.pendingCommand || this.acknowledgement) {
      this.disable('invalid-exchange-command')
      return
    }
    this.lastCommandSequence = command.sequence
    this.pendingCommand = command
    this.session?.requestGeometry(JSON.stringify(command), enrollment.kwinPeer)
  }

  private observe(event: Observation): void {
    if (this.state === 'disabled')
      return
    if (event.type === 'disabled') {
      this.disable(event.reason)
      return
    }
    if (event.type === 'pointer')
      this.sample = event.sample
    if (event.type === 'geometry') {
      if (this.acknowledgement || event.reply.requestId !== this.pendingCommand?.requestId) {
        this.disable('unexpected-geometry-acknowledgement')
        return
      }
      this.pendingCommand = null
      this.acknowledgement = event.reply
    }
    if (!this.notify(event))
      throw new Error('Observation delivery failed')
  }

  private notify(event: Observation): boolean {
    try {
      this.publish(event)
      return !this.stopped
    }
    catch {
      this.disable('observation-delivery-failed')
      return false
    }
  }

  private connect(signal: Signal, handler: () => void): void {
    signal.connect(handler)
    this.disconnect.push(() => signal.disconnect(handler))
  }

  private readClock(): number | null {
    let now: number
    try {
      now = this.runtime.now()
    }
    catch {
      this.disable('clock-read-failed')
      return null
    }
    if (!Number.isFinite(now) || now < this.lastNow) {
      this.disable('clock-reset')
      return null
    }
    this.lastNow = now
    return now
  }

  private checkLease(): number | null {
    const now = this.readClock()
    if (now === null)
      return null
    if (now >= this.leaseUntil) {
      this.disable('helper-lease-expired')
      return null
    }
    return now
  }
}

function withinFrameLimit(frame: string): boolean {
  if (frame.length > 8192)
    return false
  // Count UTF-8 bytes without a browser encoder or a second, potentially oversized buffer.
  let bytes = 0
  for (let index = 0; index < frame.length; index++) {
    const code = frame.charCodeAt(index)
    if (code <= 0x7F) {
      bytes++
    }
    else if (code <= 0x7FF) {
      bytes += 2
    }
    else if (code >= 0xD800 && code <= 0xDBFF) {
      const next = frame.charCodeAt(++index)
      if (!Number.isFinite(next) || next < 0xDC00 || next > 0xDFFF)
        return false
      bytes += 4
    }
    else if (code >= 0xDC00 && code <= 0xDFFF) {
      return false
    }
    else {
      bytes += 3
    }
    if (bytes > 8192)
      return false
  }
  return true
}
