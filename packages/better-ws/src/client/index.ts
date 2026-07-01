import type { WsCloseDetails, WsSendResult, WsState } from '../shared'

import { createContext, defineEventa } from '@moeru/eventa'

import { createEventWaitFor, normalizeSendResult } from '../shared'

const clientStateChangeEvent = defineEventa<ClientStateChange>('better-ws:client:state-change')

/**
 * Low-level connection adapter used by {@link Client}.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface ClientConnection<TMessage> {
  /** Sends one caller-owned message through the active connection. */
  send: (message: TMessage) => boolean | number | void
  /** Sends a native ping frame when the runtime adapter exposes one. */
  ping?: () => boolean | number | void
  /** Sends a native pong frame when the runtime adapter exposes one. */
  pong?: () => boolean | number | void
  /** Closes the active connection. */
  close?: (code?: number, reason?: string) => void
}

/**
 * Event sink passed to client connectors.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface ClientEvents<TMessage> {
  /** Delivers one adapter-decoded message to the client runtime. */
  message: (message: TMessage) => void
  /** Reports that the underlying transport closed. */
  close: (details?: WsCloseDetails) => void
  /**
   * Reports a fatal transport error for the active connection.
   *
   * Adapters may emit both error and close for the same failure. The client
   * keeps those paths isolated by connection epoch so stale or duplicate
   * follow-up events do not schedule additional reconnects.
   */
  error: (error: unknown) => void
}

/**
 * Creates runtime-specific client connections.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface ClientConnector<TMessage> {
  /** Opens a new connection and wires adapter events into the provided event sink. */
  connect: (events: ClientEvents<TMessage>) => Promise<ClientConnection<TMessage>> | ClientConnection<TMessage>
}

/**
 * Timer handle used by reconnect scheduling.
 */
export interface ScheduledTask {
  /** Cancels the scheduled task if it has not run yet. */
  cancel: () => void
}

/**
 * Reconnect policy for {@link createClient}.
 */
export interface ReconnectOptions {
  /**
   * Maximum reconnect attempts, or a predicate that decides whether the
   * current attempt should run.
   *
   * @default Infinity
   */
  retries?: number | ((attempt: number, error: unknown) => boolean)
  /**
   * Delay in milliseconds, or a resolver for the current attempt.
   *
   * Defaults to exponential backoff capped at 30 seconds:
   * `Math.min(1000 * 2 ** (attempt - 1), 30000)`.
   */
  delay?: number | ((attempt: number, error: unknown) => number)
  /** Called when the retry policy stops reconnecting. */
  onFailed?: (error: unknown) => void
  /** Whether prepare failures should schedule reconnect attempts. @default true */
  retryOnPrepareError?: boolean
  /** Randomizes reconnect delay by this factor in both directions. Clamped to the 0..1 range. @default 0 */
  reconnectRandomFactor?: number
  /** Minimum open duration before reconnect attempts reset. @default 0 */
  reconnectMinConnectedDuration?: number
}

/**
 * Application-level or adapter-native heartbeat policy for {@link createClient}.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface HeartbeatOptions<TMessage> {
  /**
   * Heartbeat transport mode.
   *
   * `auto` uses `connection.ping()` when the adapter exposes it, otherwise it
   * falls back to message heartbeat when `message` is provided. `native`
   * requires adapter support for `connection.ping()`. `message` sends the
   * configured `message` value.
   *
   * @default 'auto'
   */
  mode?: 'auto' | 'native' | 'message'
  /**
   * Delay in milliseconds between heartbeat checks while the client is ready.
   *
   * @default 30000
   */
  interval?: number
  /**
   * Maximum time in milliseconds to wait for read liveness after a heartbeat.
   *
   * @default 10000
   */
  timeout?: number
  /** Message value, or message factory, used by message heartbeat mode. */
  message?: TMessage | (() => TMessage)
  /**
   * Predicate that marks an inbound message as the strict heartbeat response.
   *
   * When omitted, any inbound message clears the pending heartbeat timeout.
   */
  isResponse?: (message: TMessage) => boolean
}

export interface ClientMessageContext<TMessage> {
  /** Client that received the message. */
  client: Client<TMessage>
  /** Incoming caller-owned message. */
  message: TMessage
}

export interface ClientStateChange {
  /** Previous client state. */
  previousState: WsState
  /** Current client state. */
  state: WsState
}

/**
 * Controls how long a prepare procedure waits for an incoming message.
 */
export interface WaitForOptions {
  /** Maximum time in milliseconds to wait before rejecting. When omitted, no timeout is scheduled. */
  timeout?: number
  /** External cancellation signal that aborts this wait independently from the owning prepare procedure. */
  signal?: AbortSignal
}

/**
 * Context passed to a client prepare procedure after the transport opens.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface PrepareContext<TMessage> {
  /** Signal aborted when the client closes, the active connect becomes stale, or prepare is cancelled. */
  signal: AbortSignal
  /** Reconnect attempt index for this connection. The first connection uses `0`. */
  attempt: number
  /** Whether this prepare call belongs to a reconnect attempt. */
  reconnecting: boolean
  /** Sends a bootstrap message while the client is `open`, `preparing`, or `ready`. */
  send: (message: TMessage) => WsSendResult
  /**
   * Waits for the first future message that matches the predicate.
   *
   * Rejects when its timeout expires or when the prepare/client signal aborts.
   * Matching messages are still dispatched to normal `onMessage` handlers.
   * Async predicates may overlap when multiple messages arrive before earlier
   * predicate promises settle.
   */
  waitFor: (
    predicate: (message: TMessage) => boolean | Promise<boolean>,
    options?: WaitForOptions,
  ) => Promise<TMessage>
}

/**
 * Shared options for all client connection adapters.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface ClientBaseOptions<TMessage = unknown> {
  /** Reconnect policy. Reconnect is enabled by default; pass `false` to disable. @default true */
  reconnect?: boolean | ReconnectOptions
  /** Heartbeat policy. Heartbeats are disabled unless this option is provided. @default false */
  heartbeat?: false | HeartbeatOptions<TMessage>
  /**
   * Optional bootstrap procedure that must finish before the client becomes `ready`.
   *
   * If prepare fails with reconnect disabled, the client transitions to
   * `failed`. If reconnect is enabled, the current `connect()` rejects and a
   * retry is scheduled through the reconnect policy.
   */
  prepare?: (context: PrepareContext<TMessage>) => Promise<void> | void
  /** Injectable scheduler for tests or custom timer runtimes. */
  schedule?: (delay: number, run: () => void) => ScheduledTask
}

/**
 * Options for a client backed by a caller-provided runtime connector.
 *
 * @param TMessage - Message shape owned by the caller.
 */
export interface ClientConnectorOptions<TMessage> extends ClientBaseOptions<TMessage> {
  /** Adapter that opens concrete runtime connections. */
  connector: ClientConnector<TMessage>
}

/**
 * Options for the built-in native text socket adapter.
 */
export interface ClientUrlOptions extends ClientBaseOptions<string> {
  /** URL passed to the socket constructor. */
  url: string | URL
  /** Optional subprotocols passed to the socket constructor. */
  protocols?: string | string[]
  /** WebSocket constructor. Defaults to `globalThis.WebSocket` when available. */
  wsConstructor?: typeof WebSocket
}

export type ClientOptions<TMessage = string> = ClientConnectorOptions<TMessage> | ClientUrlOptions

/**
 * Options that control local send gating.
 */
export interface ClientSendOptions {
  /**
   * Whether `send` requires the client to be `ready`.
   *
   * When `true` or omitted, sends are allowed only in `ready`. When `false`,
   * sends may run in `open`, `preparing`, or `ready`, which is intended for
   * connection preparation and protocol bootstrap messages.
   *
   * @default true
   */
  requireReady?: boolean
}

export interface Client<TMessage> {
  /** Current connection lifecycle state. */
  readonly state: WsState
  /**
   * Opens the client connection.
   *
   * Calling `connect()` again replaces any active or pending connection. This
   * is intentional restart behavior, not idempotent ensure-connected behavior.
   */
  connect: () => Promise<void>
  /** Sends one message over the active connection. */
  send: (message: TMessage, options?: ClientSendOptions) => WsSendResult
  /** Closes the client and suppresses reconnect scheduling. */
  close: (code?: number, reason?: string) => void
  /** Registers an incoming message handler. */
  onMessage: (handler: (context: ClientMessageContext<TMessage>) => void | Promise<void>) => () => void
  /** Registers a state change handler. */
  onStateChange: (handler: (change: ClientStateChange) => void) => () => void
}

function defaultSchedule(delay: number, run: () => void): ScheduledTask {
  const handle = setTimeout(run, delay)
  return {
    cancel: () => clearTimeout(handle),
  }
}

function createConnectionClosedError() {
  return new Error('Connection closed')
}

/**
 * Normalizes reconnect policy into the runtime shape used by close and
 * prepare-failure paths.
 *
 * Before:
 * - `undefined`
 * - `true`
 * - `{ delay: 100 }`
 *
 * After:
 * - full reconnect policy with default infinite retries and exponential backoff
 */
function normalizeReconnectOptions(reconnect: ClientBaseOptions['reconnect']): false | Required<ReconnectOptions> {
  if (reconnect === false) {
    return false
  }

  const options = reconnect === true || typeof reconnect === 'undefined' ? {} : reconnect
  return {
    retries: options.retries ?? Number.POSITIVE_INFINITY,
    delay: options.delay ?? ((attempt: number) => Math.min(1000 * 2 ** (attempt - 1), 30_000)),
    onFailed: options.onFailed ?? (() => {}),
    retryOnPrepareError: options.retryOnPrepareError ?? true,
    reconnectRandomFactor: normalizeReconnectRandomFactor(options.reconnectRandomFactor),
    reconnectMinConnectedDuration: options.reconnectMinConnectedDuration ?? 0,
  }
}

function shouldRetry(retries: Required<ReconnectOptions>['retries'], attempt: number, error: unknown): boolean {
  return typeof retries === 'number'
    ? attempt <= retries
    : retries(attempt, error)
}

function resolveReconnectDelay(options: Required<ReconnectOptions>, attempt: number, error: unknown): number {
  return typeof options.delay === 'number' ? options.delay : options.delay(attempt, error)
}

function normalizeReconnectRandomFactor(randomFactor: number | undefined): number {
  if (typeof randomFactor !== 'number' || Number.isNaN(randomFactor)) {
    return 0
  }

  return Math.min(1, Math.max(0, randomFactor))
}

function applyReconnectRandomFactor(delay: number, randomFactor: number): number {
  if (randomFactor <= 0 || delay <= 0) {
    return delay
  }

  const factor = 1 + ((Math.random() * 2 - 1) * randomFactor)
  return Math.max(1, Math.round(delay * factor))
}

type NormalizedHeartbeatOptions<TMessage> = Required<Pick<HeartbeatOptions<TMessage>, 'mode' | 'interval' | 'timeout'>>
  & Pick<HeartbeatOptions<TMessage>, 'message' | 'isResponse'>

function normalizeHeartbeatOptions<TMessage>(
  heartbeat: ClientBaseOptions<TMessage>['heartbeat'],
): false | NormalizedHeartbeatOptions<TMessage> {
  if (!heartbeat) {
    return false
  }

  return {
    mode: heartbeat.mode ?? 'auto',
    interval: heartbeat.interval ?? 30_000,
    timeout: heartbeat.timeout ?? 10_000,
    message: heartbeat.message,
    isResponse: heartbeat.isResponse,
  }
}

function createHeartbeatTimeoutError(timeout: number) {
  return new Error(`Heartbeat timed out after ${timeout}ms.`)
}

/**
 * Creates a client that owns reconnect, state tracking, and handler dispatch.
 *
 * Pass `url` for the built-in text socket adapter. Pass `connector` when the
 * runtime is not the browser global socket, or when messages need custom
 * serialization before they reach the client runtime.
 */
export function createClient(options: ClientUrlOptions): Client<string>
export function createClient<TMessage>(options: ClientConnectorOptions<TMessage>): Client<TMessage>
export function createClient<TMessage>(options: ClientOptions<TMessage>): Client<TMessage> | Client<string> {
  if ('connector' in options) {
    return createClientWithConnector(options, options.connector)
  }

  return createClientWithConnector(options, createSocketConnector(options))
}

function createClientWithConnector<TMessage>(
  options: ClientBaseOptions<TMessage>,
  connector: ClientConnector<TMessage>,
): Client<TMessage> {
  let state: WsState = 'idle'
  let connection: ClientConnection<TMessage> | undefined
  let reconnectAttempt = 0
  let manuallyClosed = false

  const reconnectOptions = normalizeReconnectOptions(options.reconnect)
  const heartbeatOptions = normalizeHeartbeatOptions(options.heartbeat)

  let lastCloseError: unknown = createConnectionClosedError()
  let reconnectTask: ScheduledTask | undefined
  let connectedAt: number | undefined
  let heartbeatIntervalTask: ScheduledTask | undefined
  let heartbeatTimeoutTask: ScheduledTask | undefined
  let prepareController: AbortController | undefined

  const waiters = new Set<(message: TMessage) => void>()
  // NOTICE:
  // `connect()` can resolve after `close()` or a newer reconnect has already
  // changed the active connection. Track a monotonic connection epoch so stale
  // async completions close their own connection instead of replacing current
  // client state.
  let connectionEpoch = 0
  const events = createContext()
  const clientMessageEvent = defineEventa<ClientMessageContext<TMessage>>('better-ws:client:message')

  const client: Client<TMessage> = {
    get state() {
      return state
    },
    async connect() {
      await connectInternal(false)
    },
    send(message, sendOptions) {
      const requiredState = sendOptions?.requireReady === false ? 'open' : 'ready'
      const canSend = requiredState === 'ready'
        ? state === 'ready'
        : state === 'open' || state === 'preparing' || state === 'ready'

      if (!connection || !canSend) {
        return { ok: false, reason: 'closed' }
      }

      return normalizeSendResult(() => connection?.send(message))
    },
    close(code, reason) {
      manuallyClosed = true
      connectionEpoch += 1
      stopHeartbeat()

      prepareController?.abort()
      prepareController = undefined

      reconnectTask?.cancel()
      reconnectTask = undefined

      transition('closing')

      connection?.close?.(code, reason)
      connection = undefined

      connectedAt = undefined

      transition('closed')
    },
    onMessage(handler) {
      return events.on(clientMessageEvent, event => handler(event.body!))
    },
    onStateChange(handler) {
      return events.on(clientStateChangeEvent, event => handler(event.body!))
    },
  }

  async function connectInternal(automaticReconnect: boolean): Promise<void> {
    manuallyClosed = false
    const currentConnectionEpoch = ++connectionEpoch
    stopHeartbeat()

    prepareController?.abort()
    prepareController = undefined

    connection?.close?.()
    connection = undefined

    reconnectTask?.cancel()
    reconnectTask = undefined

    connectedAt = undefined

    transition(automaticReconnect ? 'reconnecting' : 'connecting')

    let nextConnection: ClientConnection<TMessage>
    try {
      nextConnection = await connector.connect({
        message: message => dispatchMessage(currentConnectionEpoch, message),
        close: details => handleClose(currentConnectionEpoch, details),
        error: error => dispatchError(currentConnectionEpoch, error),
      })
    }
    catch (error) {
      if (currentConnectionEpoch === connectionEpoch) {
        stopHeartbeat()
        if (reconnectOptions && !manuallyClosed) {
          lastCloseError = error
          scheduleReconnect(error)
          if (automaticReconnect) {
            return
          }
        }

        else {
          transition('closed')
        }
      }
      if (automaticReconnect) {
        return
      }

      throw error
    }

    if ((currentConnectionEpoch !== connectionEpoch || manuallyClosed)) {
      (prepareController as AbortController | undefined)?.abort()
      prepareController = undefined

      nextConnection.close?.()
      return
    }

    connection = nextConnection
    connectedAt = Date.now()
    lastCloseError = createConnectionClosedError()

    transition('open')

    let currentPrepareController: AbortController | undefined
    try {
      if (options.prepare) {
        transition('preparing')

        currentPrepareController = new AbortController()
        prepareController = currentPrepareController

        await options.prepare({
          signal: currentPrepareController.signal,
          attempt: reconnectAttempt,
          reconnecting: reconnectAttempt > 0,
          send: message => client.send(message, { requireReady: false }),
          waitFor: createWaitForMessage(currentPrepareController.signal, currentConnectionEpoch),
        })

        currentPrepareController.abort()
        if (prepareController === currentPrepareController) {
          prepareController = undefined
        }
      }
    }
    catch (error) {
      currentPrepareController?.abort()
      if (prepareController === currentPrepareController) {
        prepareController = undefined
      }
      if (currentConnectionEpoch !== connectionEpoch || manuallyClosed) {
        if (connection === nextConnection) {
          nextConnection.close?.()
          connection = undefined
        }

        return
      }

      connectionEpoch += 1
      stopHeartbeat()

      nextConnection.close?.()
      connection = undefined

      resetReconnectAttemptAfterStableConnection()

      lastCloseError = error
      if (reconnectOptions && reconnectOptions.retryOnPrepareError) {
        scheduleReconnect(error)
      }
      else {
        transition('failed')
      }
      if (automaticReconnect) {
        return
      }

      throw error
    }

    if (currentConnectionEpoch !== connectionEpoch || manuallyClosed) {
      currentPrepareController?.abort()
      if (prepareController === currentPrepareController) {
        prepareController = undefined
      }
      if (connection === nextConnection) {
        stopHeartbeat()
        nextConnection.close?.()
        connection = undefined
      }

      return
    }

    if (!reconnectOptions || reconnectOptions.reconnectMinConnectedDuration <= 0) {
      reconnectAttempt = 0
    }

    transition('ready')
    scheduleHeartbeat(currentConnectionEpoch)
  }

  function transition(nextState: WsState) {
    if (state === nextState) {
      return
    }

    const previousState = state
    state = nextState
    events.emit(clientStateChangeEvent, { previousState, state })
  }

  function dispatchMessage(connectionMessageEpoch: number, message: TMessage) {
    if (connectionMessageEpoch !== connectionEpoch) {
      return
    }

    refreshHeartbeat(connectionMessageEpoch, message)

    events.emit(clientMessageEvent, { client, message })
    for (const waiter of waiters) {
      waiter(message)
    }
  }

  function dispatchError(connectionErrorEpoch: number, error: unknown) {
    if (connectionErrorEpoch !== connectionEpoch) {
      return
    }

    lastCloseError = error
    const erroredConnection = connection
    erroredConnection?.close?.()
    handleClose(connectionErrorEpoch, { reason: 'error' })
  }

  function handleClose(connectionCloseEpoch: number, _details?: WsCloseDetails) {
    if (connectionCloseEpoch !== connectionEpoch) {
      return
    }

    connectionEpoch += 1
    stopHeartbeat()

    prepareController?.abort()
    prepareController = undefined
    connection = undefined

    resetReconnectAttemptAfterStableConnection()
    if (manuallyClosed) {
      transition('closed')
      return
    }

    if (!reconnectOptions) {
      transition('closed')
      return
    }

    scheduleReconnect(lastCloseError)
  }

  function scheduleReconnect(error: unknown) {
    stopHeartbeat()

    const nextAttempt = reconnectAttempt + 1
    if (!reconnectOptions) {
      failReconnect(error)
      return
    }

    let retryAllowed: boolean
    try {
      retryAllowed = shouldRetry(reconnectOptions.retries, nextAttempt, error)
    }
    catch (policyError) {
      failReconnect(policyError)

      return
    }

    if (!retryAllowed) {
      failReconnect(error)

      return
    }

    let delay: number
    try {
      delay = applyReconnectRandomFactor(
        resolveReconnectDelay(reconnectOptions, nextAttempt, error),
        reconnectOptions.reconnectRandomFactor,
      )
    }
    catch (policyError) {
      failReconnect(policyError)
      return
    }

    reconnectAttempt = nextAttempt

    transition('reconnecting')

    const schedule = options.schedule ?? defaultSchedule
    reconnectTask = schedule(delay, () => {
      void connectInternal(true)
    })
  }

  function resetReconnectAttemptAfterStableConnection() {
    if (!reconnectOptions || reconnectOptions.reconnectMinConnectedDuration <= 0 || connectedAt === undefined) {
      connectedAt = undefined
      return
    }

    const connectedFor = Date.now() - connectedAt
    connectedAt = undefined
    if (connectedFor >= reconnectOptions.reconnectMinConnectedDuration) {
      reconnectAttempt = 0
    }
  }

  function scheduleHeartbeat(heartbeatConnectionEpoch: number) {
    if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch || state !== 'ready') {
      return
    }

    heartbeatIntervalTask?.cancel()

    const schedule = options.schedule ?? defaultSchedule
    heartbeatIntervalTask = schedule(heartbeatOptions.interval, () => {
      heartbeatIntervalTask = undefined
      runHeartbeat(heartbeatConnectionEpoch)
    })
  }

  function runHeartbeat(heartbeatConnectionEpoch: number) {
    if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch || state !== 'ready' || manuallyClosed) {
      return
    }

    const heartbeatSent = sendHeartbeat()
    if (!heartbeatSent) {
      if (heartbeatOptions.mode === 'native') {
        failHeartbeat(heartbeatConnectionEpoch, new Error('Native heartbeat requires connection.ping().'))
      }
      else if (heartbeatOptions.mode === 'message' && heartbeatOptions.message === undefined) {
        failHeartbeat(heartbeatConnectionEpoch, new Error('Message heartbeat requires heartbeat.message.'))
      }
      return
    }

    heartbeatTimeoutTask?.cancel()
    const schedule = options.schedule ?? defaultSchedule
    heartbeatTimeoutTask = schedule(heartbeatOptions.timeout, () => {
      heartbeatTimeoutTask = undefined
      failHeartbeat(heartbeatConnectionEpoch, createHeartbeatTimeoutError(heartbeatOptions.timeout))
    })
  }

  function sendHeartbeat(): boolean {
    if (!heartbeatOptions) {
      return false
    }

    if ((heartbeatOptions.mode === 'auto' || heartbeatOptions.mode === 'native') && connection?.ping) {
      // Since we asserted that connection?.ping() defined,
      // then here we explicitly ! the invoke.
      const result = normalizeSendResult(() => connection?.ping!())
      return result.ok
    }

    if ((heartbeatOptions.mode === 'auto' || heartbeatOptions.mode === 'message') && heartbeatOptions.message !== undefined) {
      const heartbeatMessage = typeof heartbeatOptions.message === 'function'
        ? (heartbeatOptions.message as () => TMessage)()
        : heartbeatOptions.message

      return client.send(heartbeatMessage, { requireReady: false }).ok
    }

    return false
  }

  function refreshHeartbeat(heartbeatConnectionEpoch: number, message: TMessage) {
    if (!heartbeatOptions || heartbeatConnectionEpoch !== connectionEpoch) {
      return
    }

    const isStrictResponse = heartbeatOptions.isResponse?.(message)
    if (isStrictResponse ?? true) {
      heartbeatTimeoutTask?.cancel()
      heartbeatTimeoutTask = undefined
    }
    else if (heartbeatTimeoutTask) {
      return
    }

    if (state === 'ready') {
      scheduleHeartbeat(heartbeatConnectionEpoch)
    }
  }

  function failHeartbeat(heartbeatConnectionEpoch: number, error: unknown) {
    if (heartbeatConnectionEpoch !== connectionEpoch || manuallyClosed) {
      return
    }

    lastCloseError = error
    const timedOutConnection = connection
    connectionEpoch += 1
    stopHeartbeat()
    prepareController?.abort()
    prepareController = undefined
    connection = undefined
    resetReconnectAttemptAfterStableConnection()
    timedOutConnection?.close?.()

    if (manuallyClosed) {
      transition('closed')
      return
    }

    if (!reconnectOptions) {
      transition('closed')
      return
    }

    scheduleReconnect(error)
  }

  function stopHeartbeat() {
    heartbeatIntervalTask?.cancel()
    heartbeatIntervalTask = undefined
    heartbeatTimeoutTask?.cancel()
    heartbeatTimeoutTask = undefined
  }

  function failReconnect(error: unknown) {
    transition('failed')
    if (!reconnectOptions) {
      return
    }

    try {
      reconnectOptions.onFailed(error)
    }
    catch {
      // onFailed is a notification hook; state has already moved to failed.
    }
  }

  function createWaitForMessage(
    activePrepareSignal: AbortSignal,
    prepareConnectionEpoch: number,
  ) {
    return (
      predicate: (message: TMessage) => boolean | Promise<boolean>,
      waitOptions: WaitForOptions = {},
    ): Promise<TMessage> => {
      const wait = createEventWaitFor<TMessage>({
        match: predicate,
        timeout: waitOptions.timeout,
        signals: [activePrepareSignal, waitOptions.signal],
        isActive: () => prepareConnectionEpoch === connectionEpoch,
        abortMessage: 'Wait for message aborted.',
        timeoutMessage: 'Timed out waiting for message.',
      })

      waiters.add(wait.emit)

      void wait.promise.finally(() => {
        waiters.delete(wait.emit)
      }).catch(() => {})

      return wait.promise
    }
  }

  return client
}

function createSocketConnector(options: ClientUrlOptions): ClientConnector<string> {
  return {
    connect(events) {
      const WsConstructor = options.wsConstructor ?? globalThis.WebSocket
      if (!WsConstructor) {
        throw new Error('No WebSocket constructor is available. Pass `wsConstructor` or use a connector.')
      }

      const ws = new WsConstructor(options.url, options.protocols)
      return new Promise<ClientConnection<string>>((resolve, reject) => {
        let opened = false
        let failedBeforeOpen = false
        ws.onopen = () => {
          opened = true
          resolve({
            send: message => ws.send(message),
            close: (code, reason) => ws.close(code, reason),
          })
        }
        ws.onmessage = (event) => {
          if (typeof event.data === 'string') {
            events.message(event.data)
            return
          }

          events.error(new TypeError('The built-in WebSocket connector only supports text messages.'))
        }
        ws.onerror = (event) => {
          if (!opened) {
            failedBeforeOpen = true
            reject(new Error('WebSocket connection failed before opening.'))
            return
          }

          events.error(event)
        }
        ws.onclose = (event) => {
          if (failedBeforeOpen) {
            return
          }

          events.close({
            code: event.code,
            reason: event.reason,
            wasClean: event.wasClean,
          })
        }
      })
    },
  }
}
