import type { Point, Rectangle } from 'electron'

const endpoint = 'ws://127.0.0.1:6181'
const reconnectInterval = 1000
const snapshotMaxAge = 1500
const freshnessCheckInterval = 250

interface CursorSnapshot {
  cursor: Point
  windows: Map<string, Rectangle>
}

interface CursorSocket {
  close(): void
  onClose(listener: () => void): void
  onError(listener: (error: unknown) => void): void
  onMessage(listener: (data: unknown) => void): void
}

interface CursorBridgeOptions {
  createSocket: () => CursorSocket
  reportUnavailable: (message: string, error?: unknown) => void
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function parseBounds(value: unknown): Rectangle | undefined {
  if (!isRecord(value))
    return undefined

  const { x, y, width, height } = value
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !isFiniteNumber(width) || !isFiniteNumber(height) || width <= 0 || height <= 0)
    return undefined

  return { x, y, width, height }
}

function parseWindows(value: unknown): Map<string, Rectangle> | undefined {
  if (!Array.isArray(value))
    return undefined

  const windows = new Map<string, Rectangle>()
  const duplicates = new Set<string>()

  for (const entry of value) {
    if (!isRecord(entry) || typeof entry.title !== 'string' || entry.title.length === 0)
      return undefined

    const bounds = parseBounds(entry.bounds)
    if (!bounds)
      return undefined

    if (windows.has(entry.title)) {
      windows.delete(entry.title)
      duplicates.add(entry.title)
      continue
    }

    if (!duplicates.has(entry.title))
      windows.set(entry.title, bounds)
  }

  return windows
}

function parseSnapshot(value: unknown): CursorSnapshot | undefined {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.cursor))
    return undefined

  const { x, y } = value.cursor
  const windows = parseWindows(value.windows)
  if (!isFiniteNumber(x) || !isFiniteNumber(y) || !windows)
    return undefined

  return { cursor: { x, y }, windows }
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

  start(): void {
    if (this.started)
      return

    this.started = true
    this.freshnessTimer = setInterval(() => this.expireStaleSnapshot(), freshnessCheckInterval)
    this.connect()
  }

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
    socket.onError((error) => {
      if (this.socket === socket)
        this.snapshot = undefined

      this.reportUnavailable(error)
      socket.close()
    })
    socket.onClose(() => {
      if (this.socket === socket)
        this.socket = undefined

      this.snapshot = undefined
      this.snapshotReceivedAt = undefined
      this.connectionStartedAt = undefined
      this.scheduleReconnect()
    })
  }

  private handleMessage(socket: CursorSocket, data: unknown): void {
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
