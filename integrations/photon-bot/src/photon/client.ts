import type { Socket } from 'socket.io-client'

import { useLogg } from '@guiiai/logg'
import { errorMessageFrom } from '@moeru/std'
import { io } from 'socket.io-client'

const log = useLogg('PhotonStream').useGlobalConfig()
const API_VERSION = '2026-07-01'
const RECONNECT_DELAY_MS = 2000

export interface PhotonConnection {
  baseUrl: string
  projectId: string
  apiKey: string
}

interface PhotonUser {
  id: string
  handle: string
}

/** The part of a stream event that the adapter reads. Photon publishes no TypeScript types for stream events. */
export interface PhotonEvent {
  type: string
  data: {
    object: {
      id: string
      space?: { id: string }
      sentBy?: PhotonUser
      receivedBy?: PhotonUser
      content?: { type: string, text?: string }
    }
  }
}

export interface PhotonStreamOptions extends PhotonConnection {
  /** Returns the saved cursor. The stream reads it for each subscription. */
  cursor: () => number
  /** Handles one delivery. The stream waits for it before it starts the next delivery. */
  onDelivery: (event: PhotonEvent, seq: number) => Promise<void>
}

/**
 * Holds the Photon event stream, which is a Socket.IO connection.
 *
 * The stream subscribes after each connect, because Photon keeps no session.
 * It handles deliveries one at a time. If a handler fails, it connects again and Photon replays from the saved cursor.
 */
export class PhotonStream {
  private readonly socket: Socket
  private queue = Promise.resolve()
  private stale = false
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
    this.socket.on('connect_error', error => log.withError(error).warn('Cannot connect to Photon'))
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
        }
        catch (error) {
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
    clearTimeout(this.retry)
    this.socket.close()
  }

  private reconnectLater(): void {
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

/** Sends one text. Photon answers 202 when it accepts the message. Delivery comes later on the stream. */
export async function sendText(connection: PhotonConnection, message: PhotonTextMessage): Promise<void> {
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
    throw new Error(`Photon refused the message: ${response.status} ${await response.text()}`)
}

/** Marks one incoming message as read. 202 means Photon accepted it; the recipient may still not see it (privacy settings). */
export async function markRead(connection: PhotonConnection, messageId: string): Promise<number> {
  const response = await fetch(`${connection.baseUrl}/v1/projects/${connection.projectId}/messages/${messageId}/read`, {
    method: 'POST',
    headers: { 'authorization': `Bearer ${connection.apiKey}`, 'idempotency-key': `airi-read:${messageId}` },
  })
  if (!response.ok)
    throw new Error(`Photon refused the read receipt: ${response.status} ${await response.text()}`)
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
    throw new Error(`Photon refused typing=${typing}: ${response.status} ${await response.text()}`)
  return response.status
}
