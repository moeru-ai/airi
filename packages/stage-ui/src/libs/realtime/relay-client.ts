import type { EventContext } from '@moeru/eventa'

import { createContext, defineInvoke, linkChannel } from '@moeru/eventa'
import { createContext as createWsContext } from '@moeru/eventa/adapters/websocket/native'
import { errorMessageFrom } from '@moeru/std'
import { authenticate, parseAuthenticateResponse, RELAY_EVENT_PREFIX } from '@proj-airi/server-sdk-shared/realtime'

/** The first retry waits this long. Each failed attempt doubles the wait, up to the maximum. */
const RECONNECT_DELAY_MS = { base: 1000, max: 30_000 }

/** The Eventa context that the devices of one account share. */
export type RelayContext = EventContext<undefined, { raw?: unknown }>

/**
 * - `stopped`: No connection is wanted, or no token is available.
 * - `connecting`: The client opens or authenticates a socket, or waits to retry.
 * - `ready`: The socket is authenticated. Events reach the other devices of the account.
 */
export type RelayStatus = 'stopped' | 'connecting' | 'ready'

export interface RelayClientOptions {
  /** The base URL of the hosted API, for example `https://api.example.com`. */
  serverUrl: string
  /** The access token of the signed-in user. The client reads it for each connection. */
  getToken: () => string | null
  onStatus?: (status: RelayStatus) => void
}

export interface RelayClient {
  /**
   * The Eventa context that the devices of the account share. It stays the same across reconnects.
   * An event that is emitted while the status is not `ready` reaches local listeners only.
   */
  readonly context: RelayContext
  readonly status: RelayStatus
  /** Connects, and reconnects after a drop. A second call while it runs does nothing. */
  start: () => void
  /** Closes the socket and stops the retries. */
  stop: () => void
}

/**
 * Builds the `/ws/v1/realtime` URL from the base URL of the hosted API.
 *
 * @example
 * relayUrlFrom('https://api.example.com/')
 * // => 'wss://api.example.com/ws/v1/realtime'
 */
export function relayUrlFrom(serverUrl: string): string {
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/v1/realtime`
  url.search = ''
  return url.toString()
}

/**
 * Connects this device to the message plane of realtime calls.
 *
 * Each socket has its own Eventa context. The client links it to the stable `context` only after the server
 * confirms the token, because the server closes a socket that sends an event before that.
 * The link passes only the events under `proj-airi:realtime:`, in both directions.
 */
export function createRelayClient(options: RelayClientOptions): RelayClient {
  const context: RelayContext = createContext()
  let status: RelayStatus = 'stopped'
  let socket: WebSocket | undefined
  let retryTimer: ReturnType<typeof setTimeout> | undefined
  let failedAttempts = 0

  function setStatus(next: RelayStatus) {
    if (status === next)
      return
    status = next
    options.onStatus?.(next)
  }

  function scheduleRetry() {
    failedAttempts += 1
    const delay = Math.min(RECONNECT_DELAY_MS.base * 2 ** (failedAttempts - 1), RECONNECT_DELAY_MS.max)
    retryTimer = setTimeout(open, delay)
  }

  function open() {
    retryTimer = undefined
    const token = options.getToken()
    if (!token) {
      setStatus('stopped')
      return
    }

    setStatus('connecting')
    const current = new WebSocket(relayUrlFrom(options.serverUrl))
    socket = current
    let unlink: (() => void) | undefined

    current.addEventListener('open', () => {
      // The adapter sends every event of its context, also its own "connected" event. The server closes a socket
      // whose first frame is not the authenticate invoke, so the context is created after the socket opens.
      const { context: remote } = createWsContext(current)
      void defineInvoke(remote, authenticate)({ token })
        .then((response) => {
          parseAuthenticateResponse(response)
          // A stop or a newer socket replaced this one while the server checked the token.
          if (socket !== current)
            return

          const link = linkChannel(context, remote)
          link.use(event => event.id.startsWith(RELAY_EVENT_PREFIX) ? undefined : false)
          unlink = () => link.dispose()
          failedAttempts = 0
          setStatus('ready')
        })
        .catch((error) => {
          console.warn('[realtime] relay authentication failed:', errorMessageFrom(error))
          current.close()
        })
    })
    current.addEventListener('close', () => {
      unlink?.()
      if (socket !== current)
        return

      socket = undefined
      setStatus('connecting')
      scheduleRetry()
    })
  }

  return {
    context,
    get status() {
      return status
    },
    start() {
      if (socket || retryTimer)
        return
      failedAttempts = 0
      open()
    },
    stop() {
      clearTimeout(retryTimer)
      retryTimer = undefined
      const current = socket
      socket = undefined
      current?.close()
      setStatus('stopped')
    },
  }
}
