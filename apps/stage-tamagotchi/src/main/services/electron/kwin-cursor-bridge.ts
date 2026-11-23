import type { Point, Rectangle } from 'electron'
import type { InferOutput } from 'valibot'

import { array, finite, gtValue, literal, minLength, number, object, pipe, safeParse, string } from 'valibot'

const endpoint = 'ws://127.0.0.1:6181'
const reconnectInterval = 1000
const snapshotMaxAge = 1500
const freshnessCheckInterval = 250

const finiteCoordinate = pipe(number(), finite())
const positiveDimension = pipe(number(), finite(), gtValue(0))
const snapshotSchema = object({
  version: literal(1),
  cursor: object({ x: finiteCoordinate, y: finiteCoordinate }),
  windows: array(object({
    title: pipe(string(), minLength(1)),
    bounds: object({ x: finiteCoordinate, y: finiteCoordinate, width: positiveDimension, height: positiveDimension }),
  })),
})

interface CursorSnapshot {
  cursor: InferOutput<typeof snapshotSchema>['cursor']
  windows: Map<string, Rectangle>
}

interface CursorSocket {
  close: () => void
  onClose: (listener: () => void) => void
  onError: (listener: (error: unknown) => void) => void
  onMessage: (listener: (data: unknown) => void) => void
}

interface CursorBridgeOptions {
  createSocket: () => CursorSocket
  reportUnavailable: (message: string, error?: unknown) => void
}

/**
 * Validates compositor snapshots and excludes ambiguous titles from geometry lookup.
 *
 * @example
 * parseSnapshot({ version: 1, cursor: { x: 0, y: 0 }, windows: [] })
 * // => { cursor: { x: 0, y: 0 }, windows: new Map() }
 */
function parseSnapshot(value: unknown): CursorSnapshot | undefined {
  const result = safeParse(snapshotSchema, value)
  if (!result.success)
    return undefined

  const windows = new Map<string, Rectangle>()
  const duplicates = new Set<string>()
  for (const entry of result.output.windows) {
    if (windows.has(entry.title)) {
      windows.delete(entry.title)
      duplicates.add(entry.title)
    }
    else if (!duplicates.has(entry.title)) {
      windows.set(entry.title, entry.bounds)
    }
  }

  return { cursor: result.output.cursor, windows }
}

function createCursorSocket(): CursorSocket {
  const socket = new WebSocket(endpoint)
  return {
    close: () => socket.close(),
    onClose: listener => socket.addEventListener('close', listener),
    onError: listener => socket.addEventListener('error', event => listener(event)),
    onMessage: listener => socket.addEventListener('message', event => listener(event.data)),
  }
}

/** Keeps fresh compositor cursor and window geometry snapshots while the local socket is open. */
export class KWinCursorBridge {
  private readonly options: CursorBridgeOptions
  private socket: CursorSocket | undefined
  private snapshot: CursorSnapshot | undefined
  private snapshotReceivedAt: number | undefined
  private connectionStartedAt: number | undefined
  private reconnectTimer: ReturnType<typeof setTimeout> | undefined
  private freshnessTimer: ReturnType<typeof setInterval> | undefined
  private started = false
  private stopped = false
  private unavailableReported = false
  private readonly missingWindowTitles = new Set<string>()

  constructor(options: CursorBridgeOptions) {
    this.options = options
  }

  /** Connects once and starts freshness checks for this process-owned bridge. */
  start(): void {
    if (this.started)
      return

    this.started = true
    this.freshnessTimer = setInterval(() => this.expireStaleSnapshot(), freshnessCheckInterval)
    this.connect()
  }

  /** Discards geometry and stops reconnect and freshness timers before the runtime closes. */
  stop(): void {
    this.stopped = true
    this.snapshot = undefined
    this.snapshotReceivedAt = undefined
    this.connectionStartedAt = undefined

    if (this.reconnectTimer)
      clearTimeout(this.reconnectTimer)
    if (this.freshnessTimer)
      clearInterval(this.freshnessTimer)

    this.socket?.close()
    this.socket = undefined
  }

  getCursorScreenPoint(): Point | undefined {
    this.expireStaleSnapshot()
    return this.snapshot?.cursor
  }

  getWindowBounds(title: string): Rectangle | undefined {
    this.expireStaleSnapshot()
    const bounds = this.snapshot?.windows.get(title)
    if (!bounds && this.snapshot && !this.missingWindowTitles.has(title)) {
      this.missingWindowTitles.add(title)
      this.options.reportUnavailable(`KWin cursor bridge has no unique geometry for the AIRI window titled "${title}".`)
    }

    return bounds
  }

  private connect(): void {
    if (this.stopped)
      return

    let socket: CursorSocket
    try {
      socket = this.options.createSocket()
    }
    catch (error) {
      this.reportUnavailable(error)
      this.scheduleReconnect()
      return
    }

    this.socket = socket
    this.connectionStartedAt = Date.now()
    socket.onMessage(data => this.handleMessage(socket, data))
    socket.onError(error => this.handleSocketError(socket, error))
    socket.onClose(() => this.handleSocketClosed(socket))
  }

  /** Triggering workflow: current socket error -> discard its snapshot -> close and reconnect. */
  private handleSocketError(socket: CursorSocket, error: unknown): void {
    if (this.socket !== socket)
      return
    this.snapshot = undefined
    this.reportUnavailable(error)
    socket.close()
  }

  /** Triggering workflow: current socket close -> clear compositor geometry -> schedule reconnection. */
  private handleSocketClosed(socket: CursorSocket): void {
    if (this.socket !== socket)
      return
    this.socket = undefined
    this.snapshot = undefined
    this.snapshotReceivedAt = undefined
    this.connectionStartedAt = undefined
    this.scheduleReconnect()
  }

  /** Triggering workflow: current socket message -> validated snapshot -> renderer cursor and window geometry reads. */

  private handleMessage(socket: CursorSocket, data: unknown): void {
    if (this.socket !== socket)
      return

    if (typeof data !== 'string') {
      this.rejectSnapshot(socket, new Error('KWin cursor bridge expected a text snapshot.'))
      return
    }

    let value: unknown
    try {
      value = JSON.parse(data)
    }
    catch (error) {
      this.rejectSnapshot(socket, error)
      return
    }

    const snapshot = parseSnapshot(value)
    if (!snapshot) {
      this.rejectSnapshot(socket, new Error('KWin cursor bridge received a snapshot with an invalid shape.'))
      return
    }

    this.snapshot = snapshot
    this.snapshotReceivedAt = Date.now()
    this.unavailableReported = false
  }

  private rejectSnapshot(socket: CursorSocket, error: unknown): void {
    if (this.socket === socket) {
      this.snapshot = undefined
      this.snapshotReceivedAt = undefined
    }

    this.reportUnavailable(error)
    socket.close()
  }

  private expireStaleSnapshot(): void {
    const lastUpdate = this.snapshotReceivedAt ?? this.connectionStartedAt
    if (lastUpdate === undefined || Date.now() - lastUpdate <= snapshotMaxAge)
      return

    this.snapshot = undefined
    this.snapshotReceivedAt = undefined
    this.connectionStartedAt = undefined
    this.reportUnavailable(new Error(`No fresh KWin cursor snapshot received within ${snapshotMaxAge} ms.`))
    this.socket?.close()
  }

  private reportUnavailable(error?: unknown): void {
    if (this.unavailableReported)
      return

    this.unavailableReported = true
    this.options.reportUnavailable('KWin cursor bridge unavailable on 127.0.0.1:6181. Check that the AIRI KWin script is enabled and no other process owns the port.', error)
  }

  private scheduleReconnect(): void {
    if (this.stopped || this.reconnectTimer)
      return

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined
      this.connect()
    }, reconnectInterval)
  }
}

let activeBridge: KWinCursorBridge | undefined

/** Starts the process-wide compositor bridge and returns its shutdown action. */
export function startKWinCursorBridge(reportUnavailable: (message: string, error?: unknown) => void): () => void {
  const bridge = new KWinCursorBridge({
    createSocket: createCursorSocket,
    reportUnavailable,
  })
  activeBridge = bridge
  bridge.start()

  return () => {
    bridge.stop()
    if (activeBridge === bridge)
      activeBridge = undefined
  }
}

export function getKWinCursorBridge(): KWinCursorBridge | undefined {
  return activeBridge
}
