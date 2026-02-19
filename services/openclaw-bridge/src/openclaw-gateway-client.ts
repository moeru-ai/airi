import type WebSocket from 'ws'

import { randomUUID } from 'node:crypto'

const DEFAULT_POLL_INTERVAL_MS = 500
const DEFAULT_WAIT_COMPLETE_MS = 120_000

interface Req { type: 'req', id: string, method: string, params?: unknown }
interface Res<T = unknown> { type: 'res', id: string, ok: boolean, payload?: T, error?: { message?: string } }

function onceRes<T>(ws: WebSocket, id: string, timeoutMs: number): Promise<Res<T>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      cleanup()
      reject(new Error(`OpenClaw gateway RPC timeout (id=${id}) after ${timeoutMs}ms`))
    }, timeoutMs)
    const onMessage = (raw: Buffer | ArrayBuffer | Buffer[]) => {
      const data = Buffer.isBuffer(raw) ? raw.toString('utf8') : Array.isArray(raw) ? Buffer.concat(raw).toString('utf8') : new Uint8Array(raw as ArrayBuffer).toString()
      let obj: unknown
      try {
        obj = JSON.parse(data) as unknown
      }
      catch {
        return
      }
      const res = obj as Res<T>
      if (res?.type === 'res' && res.id === id) {
        cleanup()
        resolve(res)
      }
    }
    const cleanup = () => {
      clearTimeout(timer)
      ws.off('message', onMessage)
    }
    ws.on('message', onMessage)
  })
}

function rpc<T>(ws: WebSocket, method: string, params?: unknown, timeoutMs = 30_000): Promise<Res<T>> {
  const id = randomUUID()
  const req: Req = { type: 'req', id, method, params }
  ws.send(JSON.stringify(req))
  return onceRes<T>(ws, id, timeoutMs)
}

/** OpenClaw gateway protocol version (must match gateway server). */
const PROTOCOL_VERSION = 3

/** OpenClaw gateway only accepts these client ids (see gateway protocol schema). */
const GATEWAY_CLIENT_IDS = {
  GATEWAY_CLIENT: 'gateway-client',
  CONTROL_UI: 'openclaw-control-ui',
  TEST: 'test',
  CLI: 'cli',
} as const

/** Connect to the OpenClaw gateway. First message must be "connect". */
export async function connectGateway(
  ws: WebSocket,
  opts?: { token?: string, clientId?: string, timeoutMs?: number },
): Promise<void> {
  const id = randomUUID()
  const clientId = opts?.clientId ?? GATEWAY_CLIENT_IDS.GATEWAY_CLIENT
  const client = {
    id: clientId,
    version: '1.0.0',
    platform: 'node',
    mode: 'backend' as const,
  }
  const params = {
    minProtocol: PROTOCOL_VERSION,
    maxProtocol: PROTOCOL_VERSION,
    client,
    caps: [] as string[],
    commands: [] as string[],
    role: 'operator' as const,
    scopes: ['operator.write', 'operator.read'] as string[],
    auth: opts?.token ? { token: opts.token, password: undefined } : undefined,
    device: undefined as unknown,
  }
  ws.send(JSON.stringify({ type: 'req', id, method: 'connect', params }))
  const res = await onceRes<{ type?: string }>(ws, id, opts?.timeoutMs ?? 15_000)
  if (!res.ok || res.payload?.type !== 'hello-ok') {
    const err = res.error?.message ?? JSON.stringify(res.payload)
    throw new Error(`OpenClaw gateway connect failed: ${err}`)
  }
}

export interface SendAndWaitOptions {
  sessionKey: string
  message: string
  idempotencyKey: string
  pollIntervalMs?: number
  waitCompleteMs?: number
}

/** chat.send then poll with same idempotencyKey until status "ok", then return last assistant message from chat.history. */
export async function sendAndWaitForReply(
  ws: WebSocket,
  opts: SendAndWaitOptions,
): Promise<{ role: 'assistant', content: string }> {
  const { sessionKey, message, idempotencyKey, pollIntervalMs = DEFAULT_POLL_INTERVAL_MS, waitCompleteMs = DEFAULT_WAIT_COMPLETE_MS } = opts

  const sendRes = await rpc<{ runId?: string, status?: string }>(ws, 'chat.send', {
    sessionKey,
    message,
    idempotencyKey,
  })
  if (!sendRes.ok) {
    throw new Error(sendRes.error?.message ?? `chat.send failed: ${JSON.stringify(sendRes.payload)}`)
  }

  const deadline = Date.now() + waitCompleteMs
  while (Date.now() < deadline) {
    const pollRes = await rpc<{ status?: string }>(ws, 'chat.send', {
      sessionKey,
      message,
      idempotencyKey,
    })
    if (!pollRes.ok) {
      throw new Error(pollRes.error?.message ?? `chat.send poll failed`)
    }
    if (pollRes.payload?.status === 'ok') {
      break
    }
    await new Promise(r => setTimeout(r, pollIntervalMs))
  }

  const historyRes = await rpc<{ messages?: Array<{ role?: string, content?: string | unknown[] }> }>(ws, 'chat.history', { sessionKey, limit: 50 })
  if (!historyRes.ok || !Array.isArray(historyRes.payload?.messages)) {
    throw new Error(historyRes.error?.message ?? 'chat.history failed')
  }

  const messages = historyRes.payload.messages
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]
    if (msg?.role === 'assistant') {
      const content = msg.content
      const text = typeof content === 'string' ? content : Array.isArray(content) ? content.map((c: unknown) => (c && typeof c === 'object' && 'text' in c && typeof (c as { text: string }).text === 'string') ? (c as { text: string }).text : '').join('') : ''
      return { role: 'assistant' as const, content: text }
    }
  }

  throw new Error('No assistant message in chat.history after completion')
}
