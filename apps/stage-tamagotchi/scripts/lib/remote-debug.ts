/**
 * Shared Chrome DevTools Protocol helpers for smoke scripts that launch the
 * real Electron app (via `APP_REMOTE_DEBUG`) and talk to one of its
 * renderers over CDP. Kept here, rather than inline in each smoke script, so
 * the wait/retry and protocol-framing pieces stay in one place as more
 * smoke scripts are added.
 */

export interface DebugTarget {
  id: string
  title: string
  type: string
  url: string
  webSocketDebuggerUrl?: string
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

export async function findAvailablePort(): Promise<number> {
  const { createServer } = await import('node:net')

  return await new Promise((resolvePort, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      server.close(() => {
        if (typeof address === 'object' && address?.port) {
          resolvePort(address.port)
        }
        else {
          reject(new Error('failed to allocate debug port'))
        }
      })
    })
    server.on('error', reject)
  })
}

/**
 * Polls `probe` until it returns a defined value or `timeoutMs` elapses.
 * Electron's remote-debug endpoint and a renderer's readiness both come up
 * asynchronously after the process starts, so callers throughout the smoke
 * scripts wait on this instead of a fixed sleep.
 */
export async function waitFor<T>(
  label: string,
  probe: () => Promise<T | undefined> | T | undefined,
  timeoutMs: number,
  intervalMs: number,
): Promise<T> {
  const start = Date.now()
  let lastError: unknown

  while ((Date.now() - start) < timeoutMs) {
    try {
      const value = await probe()
      if (value !== undefined)
        return value
    }
    catch (error) {
      lastError = error
    }
    await sleep(intervalMs)
  }

  const suffix = lastError instanceof Error ? `: ${lastError.message}` : ''
  throw new Error(`${label} timed out after ${timeoutMs}ms${suffix}`)
}

export async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok)
    throw new Error(`${url} returned ${response.status}`)
  return await response.json() as T
}

export async function waitForRemoteDebug(debugPort: number): Promise<string> {
  return await waitFor('Electron remote debug endpoint', async () => {
    const data = await fetchJson<{ webSocketDebuggerUrl?: string }>(`http://127.0.0.1:${debugPort}/json/version`)
    return data.webSocketDebuggerUrl
  }, 120_000, 500)
}

export async function findDebugTarget(debugPort: number, label: string, predicate: (target: DebugTarget) => boolean): Promise<DebugTarget> {
  return await waitFor(label, async () => {
    const targets = await fetchJson<DebugTarget[]>(`http://127.0.0.1:${debugPort}/json/list`)
    return targets.find(predicate)
  }, 120_000, 500)
}

/**
 * Minimal CDP client: enough to send commands and await their matching
 * response by id. Smoke scripts only ever drive one target at a time, so
 * this does not track event subscriptions beyond what callers add directly.
 */
export class CdpClient {
  private socket?: WebSocket
  private nextId = 1
  private pending = new Map<number, {
    resolve: (value: Record<string, unknown>) => void
    reject: (error: Error) => void
  }>()

  constructor(socket: WebSocket) {
    this.socket = socket
    this.socket.addEventListener('message', (event) => {
      const payload = JSON.parse(String(event.data)) as Record<string, unknown>
      const id = typeof payload.id === 'number' ? payload.id : undefined
      if (id === undefined)
        return

      const pending = this.pending.get(id)
      if (!pending)
        return

      this.pending.delete(id)
      if (payload.error) {
        pending.reject(new Error(JSON.stringify(payload.error)))
      }
      else {
        pending.resolve(payload)
      }
    })
    this.socket.addEventListener('close', () => {
      this.failPending('CDP socket closed')
    })
    this.socket.addEventListener('error', () => {
      this.failPending('CDP socket errored')
    })
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url)
    await new Promise<void>((resolveOpen, reject) => {
      socket.addEventListener('open', () => resolveOpen(), { once: true })
      socket.addEventListener('error', () => reject(new Error(`failed to connect CDP target: ${url}`)), { once: true })
    })
    return new CdpClient(socket)
  }

  async send(method: string, params?: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (!this.socket) {
      throw new Error('CDP socket is closed')
    }

    const id = this.nextId++
    const promise = new Promise<Record<string, unknown>>((resolveMessage, reject) => {
      this.pending.set(id, { resolve: resolveMessage, reject })
    })

    this.socket.send(JSON.stringify({ id, method, params: params ?? {} }))
    return await promise
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    })
    const result = response.result
    if (!isRecord(result))
      throw new Error('Runtime.evaluate missing result')

    const exceptionDetails = result.exceptionDetails
    if (exceptionDetails) {
      throw new Error(JSON.stringify(exceptionDetails))
    }

    const remoteObject = result.result
    if (!isRecord(remoteObject))
      throw new Error('Runtime.evaluate missing remote object')

    return remoteObject.value as T
  }

  close() {
    this.failPending('CDP socket closed')
    this.socket?.close()
    this.socket = undefined
  }

  private failPending(reason: string) {
    if (this.pending.size === 0) {
      return
    }

    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id)
      pending.reject(new Error(`${reason} before completing request ${id}`))
    }
  }
}
