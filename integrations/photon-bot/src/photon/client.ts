import type { Socket } from 'socket.io-client'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { io } from 'socket.io-client'

const log = useLogg('PhotonStream').useGlobalConfig()
const API_VERSION = '2026-07-01'
const RECONNECT_DELAY_MS = 2000
/** The wait before the first retry with a rejected API key. Each later retry waits two times longer, up to the maximum. */
const AUTH_RETRY_DELAY_MS = 30_000
const AUTH_RETRY_MAX_DELAY_MS = 600_000

/** Photon answered 401 or 403. It does not accept the API key for the project, so the same request fails again. */
export class PhotonAuthError extends Error {
  constructor(message: string, readonly status: number) {
    super(message)
  }
}

async function refusalOf(what: string, response: Response): Promise<Error> {
  const message = `Photon refused ${what}: ${response.status} ${await response.text()}`
  return response.status === 401 || response.status === 403 ? new PhotonAuthError(message, response.status) : new Error(message)
}

/**
 * Returns the HTTP status with which Photon refused the handshake of the event stream.
 *
 * Photon answers 401 when the API key is wrong or revoked.
 */
function refusedHandshakeStatus(error: Error & { description?: unknown }): number | undefined {
  // NOTICE:
  // Socket.IO reports a refused WebSocket handshake only as "websocket error", with no status.
  // The `ws` package puts the status in its error event: "Unexpected server response: 401".
  // Source: `ws/lib/websocket.js`, and `description` of `TransportError` in `engine.io-client`.
  // Remove this parse when Socket.IO exposes the status.
  const { description } = error
  const message = typeof description === 'object' && description !== null && 'message' in description ? String(description.message) : ''
  const status = /Unexpected server response: (\d{3})/.exec(message)?.[1]
  return status ? Number(status) : undefined
}

export interface PhotonConnection {
  baseUrl: string
  projectId: string
  apiKey: string
}

interface PhotonUser {
  id: string
  handle: string
}

/** The part of a Photon message that the adapter reads. Photon publishes no TypeScript types for stream events. */
export interface PhotonMessage {
  id: string
  space?: { id: string }
  sentBy?: PhotonUser
  receivedBy?: PhotonUser
  /** The message that an inline reply answers, or that a tapback is on. */
  parentMessageId?: string
  content?: { type: string, text?: string, reaction?: string, action?: unknown }
}

export interface PhotonEvent {
  type: string
  data: { object: PhotonMessage }
}

export interface PhotonStreamOptions extends PhotonConnection {
  /** Returns the saved cursor. The stream reads it for each subscription. */
  cursor: () => number
  /** Handles one delivery. The stream waits for it before it starts the next delivery. */
  onDelivery: (event: PhotonEvent, seq: number) => Promise<void>
  /**
   * The wait before the first retry with a rejected API key.
   *
   * @default 30_000
   */
  authRetryDelayMs?: number
}

/**
 * Holds the Photon event stream, which is a Socket.IO connection.
 *
 * The stream subscribes after each connect, because Photon keeps no session.
 * It handles deliveries one at a time. If a handler fails, it connects again and Photon replays from the saved cursor.
 *
 * When Photon rejects the API key, on the handshake or in a handler, the stream logs the cause one time. Then it
 * connects again after a wait that grows with each rejection. A handled delivery ends this state.
 */
export class PhotonStream {
  private readonly socket: Socket
  private queue = Promise.resolve()
  private stale = false
  private closed = false
  private rejections = 0
  private retry?: ReturnType<typeof setTimeout>

  constructor(private readonly options: PhotonStreamOptions) {
    this.socket = io(options.baseUrl, {
      path: `/v1/projects/${options.projectId}/events/ws`,
      addTrailingSlash: false,
      transports: ['websocket'],
      extraHeaders: { Authorization: `Bearer ${options.apiKey}` },
      autoConnect: false,
    })

    this.socket.on('connect', () => this.subscribe())
    this.socket.on('connect_error', (error) => {
      const status = refusedHandshakeStatus(error)
      if (status === 401 || status === 403)
        this.backOff(status)
      else
        log.withError(error).warn('Cannot connect to Photon')
    })
    this.socket.on('delivery_error', (error: { code: string }) => log.warn(`Photon reported ${error.code}`))
    this.socket.on('disconnect', (reason) => {
      log.warn(`Photon stream disconnected: ${reason}`)
      // Socket.IO reconnects by itself only after a transport failure.
      if (reason === 'io server disconnect')
        this.reconnectLater()
    })
    this.socket.on('delivery', (event: PhotonEvent, metadata: { seq: number }) => {
      this.queue = this.queue.then(async () => {
        if (this.stale)
          return
        try {
          await options.onDelivery(event, metadata.seq)
          this.rejections = 0
        }
        catch (error) {
          // The owner closed the stream while this delivery was in progress. The owner reports that.
          if (this.closed)
            return

          if (error instanceof PhotonAuthError) {
            this.backOff(error.status)
            return
          }

          log.withError(error).error(`Delivery ${metadata.seq} failed, replaying from the saved cursor`)
          this.stale = true
          this.socket.disconnect()
          this.reconnectLater()
        }
      })
    })
  }

  start(): void {
    this.socket.connect()
  }

  close(): void {
    this.stale = true
    this.closed = true
    clearTimeout(this.retry)
    this.socket.close()
  }

  /** True from the first rejection of the API key until the stream handles a delivery. */
  get rejected(): boolean {
    return this.rejections > 0
  }

  /**
   * Stops the fast retries after Photon rejected the API key, and connects again after a longer wait.
   *
   * Socket.IO connects again every few seconds by itself. A rejected key fails each time, so the disconnect here
   * stops that loop.
   */
  private backOff(status: number): void {
    this.stale = true
    this.socket.disconnect()
    if (this.closed)
      return

    const delay = Math.min((this.options.authRetryDelayMs ?? AUTH_RETRY_DELAY_MS) * 2 ** this.rejections, AUTH_RETRY_MAX_DELAY_MS)
    if (this.rejections === 0)
      log.error(`Photon rejected the API key for project ${this.options.projectId} (${status}). Update the key on the iMessage page of AIRI, or in PHOTON_API_KEY. The bot tries again with longer waits.`)
    this.rejections += 1
    clearTimeout(this.retry)
    this.retry = setTimeout(() => this.socket.connect(), delay)
  }

  private reconnectLater(): void {
    // A handler can fail after `close()`. A closed stream must stay closed.
    if (this.closed)
      return
    clearTimeout(this.retry)
    this.retry = setTimeout(() => this.socket.connect(), RECONNECT_DELAY_MS)
  }

  private subscribe(): void {
    this.stale = false
    const startSeq = this.options.cursor()
    this.socket.timeout(10_000).emit('subscribe', { startSeq, apiVersion: API_VERSION }, (error: Error | null, ack?: { ok: boolean, error?: { code: string } }) => {
      if (error || !ack?.ok)
        log.error(`Photon refused the subscription: ${ack?.error?.code ?? errorMessageFrom(error) ?? 'unknown'}`)
      else
        log.log(`Subscribed to Photon events after cursor ${startSeq}`)
    })
  }
}

export interface PhotonTextMessage {
  spaceId: string
  senderId: string
  text: string
  /** Photon stores the first result for a key, so a repeated send does not text the person twice. */
  idempotencyKey: string
}

/**
 * Sends one text. Photon answers 202 when it accepts the message. Delivery comes later on the stream.
 *
 * Returns the ID that Photon gave to the sent message.
 */
export async function sendText(connection: PhotonConnection, message: PhotonTextMessage): Promise<string | undefined> {
  const response = await fetch(`${connection.baseUrl}/v1/projects/${connection.projectId}/messages`, {
    method: 'POST',
    headers: {
      'authorization': `Bearer ${connection.apiKey}`,
      'content-type': 'application/json',
      'idempotency-key': message.idempotencyKey,
    },
    body: JSON.stringify({
      spaceId: message.spaceId,
      senderId: message.senderId,
      content: { type: 'text', format: 'plain', text: message.text },
    }),
  })
  if (!response.ok)
    throw await refusalOf('the message', response)
  const sent = await response.json() as { id?: string }
  return sent.id
}

/** Reads one stored message of the project. Returns nothing when Photon has no message with this ID. */
export async function getMessage(connection: PhotonConnection, messageId: string): Promise<PhotonMessage | undefined> {
  const response = await fetch(`${connection.baseUrl}/v1/projects/${connection.projectId}/messages/${messageId}`, {
    headers: { authorization: `Bearer ${connection.apiKey}` },
  })
  if (response.status === 404)
    return undefined
  if (!response.ok)
    throw await refusalOf(`the read of message ${messageId}`, response)
  return await response.json() as PhotonMessage
}

/** Marks one incoming message as read. 202 means Photon accepted it; the recipient may still not see it (privacy settings). */
export async function markRead(connection: PhotonConnection, messageId: string): Promise<number> {
  const response = await fetch(`${connection.baseUrl}/v1/projects/${connection.projectId}/messages/${messageId}/read`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${connection.apiKey}`, 'idempotency-key': `airi-read:${messageId}` },
  })
  if (!response.ok)
    throw await refusalOf('the read receipt', response)
  return response.status
}

/** Starts or refreshes (true) or stops (false) the typing indicator in a space. The caller refreshes it. */
export async function setTyping(connection: PhotonConnection, spaceId: string, senderId: string, typing: boolean): Promise<number> {
  const response = await fetch(`${connection.baseUrl}/v1/projects/${connection.projectId}/spaces/${spaceId}/typing`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${connection.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({ senderId, typing }),
  })
  if (!response.ok)
    throw await refusalOf(`typing=${typing}`, response)
  return response.status
}
