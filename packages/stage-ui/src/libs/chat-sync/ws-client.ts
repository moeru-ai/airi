import type { NewMessagesPayload, PullMessagesRequest, PullMessagesResponse, SendMessagesRequest, SendMessagesResponse } from '@proj-airi/server-sdk-shared'

import { defineInvoke } from '@moeru/eventa'
import { createContext as createWsContext, wsConnectedEvent, wsDisconnectedEvent, wsErrorEvent } from '@moeru/eventa/adapters/websocket/native'
import { errorMessageFrom } from '@moeru/std'
import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'
import { useWebSocket } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

// The native ws adapter exposes a context with raw event options scoped to the
// underlying WebSocket lifecycle; reuse its inferred return type so our
// EventContext storage stays compatible with `ctx.on` / `ctx.emit` overloads.
type WsEventContext = ReturnType<typeof createWsContext>['context']

/**
 * WebSocket connection lifecycle states surfaced to the chat-sync layer.
 *
 * - `idle`: never connected, or `disconnect()` was called and we are not
 *   trying to reconnect.
 * - `connecting`: WebSocket handshake in flight (initial or reconnect attempt).
 * - `open`: socket open and `wsConnectedEvent` fired.
 * - `closed`: lost the socket; auto-reconnect may bring it back to `connecting`.
 */
export type ChatWsStatus = 'idle' | 'connecting' | 'open' | 'closed'

/**
 * Disposer returned by `onNewMessages` / `onStatusChange`. Calling it removes
 * the listener; safe to call multiple times.
 */
export type ChatWsUnsubscribe = () => void

export interface CreateChatWsClientOptions {
  /**
   * Base server URL, e.g. `https://api.airi.build`. The client appends
   * `/ws/chat?token=<jwt>` to build the WebSocket URL.
   */
  serverUrl: string
  /**
   * Resolves the current bearer token at connect/reconnect time. Returning
   * `null` skips connecting (the user is not authenticated).
   */
  getToken: () => string | null
  /**
   * Reconnect retry budget. `-1` means infinite. Forwarded to VueUse
   * `autoReconnect.retries`.
   *
   * @default -1
   */
  reconnectRetries?: number
  /**
   * Reconnect base delay in ms. Successive failed reconnects double this up
   * to `reconnectMaxDelayMs` and add jitter, mirroring the previous
   * hand-rolled backoff.
   *
   * @default 1000
   */
  reconnectBaseDelayMs?: number
  /**
   * Reconnect max delay ceiling.
   *
   * @default 30000
   */
  reconnectMaxDelayMs?: number
}

export interface ChatWsClient {
  /** Current connection status. Useful for UI banners. */
  status: () => ChatWsStatus
  /** Connect (or reconnect with the latest token). No-op if already open. */
  connect: () => void
  /** Close the socket and stop auto-reconnect until the next `connect()`. */
  disconnect: () => void
  /** RPC: push messages to a chat. Throws if disconnected. */
  sendMessages: (req: SendMessagesRequest) => Promise<SendMessagesResponse>
  /** RPC: pull messages newer than `afterSeq`. Throws if disconnected. */
  pullMessages: (req: PullMessagesRequest) => Promise<PullMessagesResponse>
  /**
   * Subscribe to inbound `newMessages` push. The handler fires for every
   * authenticated push, including potential echoes of the local sender — the
   * caller MUST dedup by message id.
   */
  onNewMessages: (handler: (payload: NewMessagesPayload) => void) => ChatWsUnsubscribe
  /** Subscribe to status transitions for UI / catchup orchestration. */
  onStatusChange: (handler: (status: ChatWsStatus) => void) => ChatWsUnsubscribe
}

/**
 * Build the `/ws/chat?token=<jwt>` URL from a base server URL.
 *
 * Before:
 * - "https://api.airi.build", token="abc"
 *
 * After:
 * - "wss://api.airi.build/ws/chat?token=abc"
 */
function buildChatWsUrl(serverUrl: string, token: string): string {
  // Use URL parsing instead of string concat so trailing slashes / paths in
  // serverUrl are normalized cleanly.
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/chat`
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Compute exponential reconnect delay with jitter from the retry counter.
 *
 * Math context: VueUse's autoReconnect supplies `retries` starting at 1 for
 * the first reconnect. Capped at `maxMs` so very long disconnects do not
 * push delay into hours.
 */
function computeReconnectDelay(retries: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, retries - 1))
  // 0..exp ms jitter to spread reconnect storms across many tabs / devices.
  return Math.floor(Math.random() * exp)
}

/**
 * Map VueUse's 3-state status onto the chat-sync 4-state machine.
 *
 * VueUse exposes `OPEN | CONNECTING | CLOSED`. Chat-sync needs to distinguish
 * "never connected / explicitly disconnected" (`idle`) from "lost the socket
 * and auto-reconnect is pending" (`closed`). The caller tracks the user
 * intent via `enabled`; here we just translate the transport state.
 */
function mapStatus(vue: 'OPEN' | 'CONNECTING' | 'CLOSED', enabled: boolean): ChatWsStatus {
  if (vue === 'OPEN')
    return 'open'
  if (vue === 'CONNECTING')
    return 'connecting'
  return enabled ? 'closed' : 'idle'
}

/**
 * Create a chat-sync WebSocket client backed by VueUse's `useWebSocket` plus
 * eventa's native ws adapter for the eventa context that handles RPC and
 * outbound subscription routing.
 *
 * Use when:
 * - The user is signed in and the chat store wants real-time sync.
 *
 * Expects:
 * - `serverUrl` includes scheme (https/http). Token must be a valid JWT;
 *   401s during the WebSocket upgrade close the socket immediately and the
 *   auto-reconnect loop will keep retrying with whatever `getToken()`
 *   returns next.
 *
 * Returns:
 * - A handle exposing connect/disconnect, RPC functions, and event hooks.
 *   The handle is safe to call across reconnects; RPC closures resolve the
 *   live `EventContext` per invocation so a reconnect-induced context swap
 *   is transparent to callers.
 */
export function createChatWsClient(options: CreateChatWsClientOptions): ChatWsClient {
  const baseDelay = options.reconnectBaseDelayMs ?? 1000
  const maxDelay = options.reconnectMaxDelayMs ?? 30_000
  const retries = options.reconnectRetries ?? -1

  // `enabled` mirrors user intent: connect() flips on, disconnect() flips off.
  // The url ref returns `undefined` when disabled, which makes useWebSocket
  // close cleanly without firing the auto-reconnect loop.
  const enabled = ref(false)
  const urlRef = computed<string | undefined>(() => {
    if (!enabled.value)
      return undefined
    const token = options.getToken()
    if (!token)
      return undefined
    return buildChatWsUrl(options.serverUrl, token)
  })

  // The eventa context is rebuilt on every `onConnected` so RPC + push
  // listeners survive a reconnect by re-binding to the fresh ws.
  const context = shallowRef<WsEventContext | undefined>(undefined)
  const contextDisposers: Array<() => void> = []
  const newMessagesHandlers = new Set<(payload: NewMessagesPayload) => void>()
  const statusHandlers = new Set<(status: ChatWsStatus) => void>()

  function notifyStatus(next: ChatWsStatus) {
    // Surface every transition in console so v1 reconnect / reconcile traces
    // are greppable; quieter console levels (warn/error) suppress this.
    console.info('[chat-ws] status →', next)
    for (const handler of statusHandlers) {
      try {
        handler(next)
      }
      catch (err) {
        // Listener errors must not poison the status pipeline.
        console.warn('[chat-ws] status handler threw:', errorMessageFrom(err))
      }
    }
  }

  function disposeContext() {
    while (contextDisposers.length > 0) {
      const dispose = contextDisposers.pop()!
      try {
        dispose()
      }
      catch {}
    }
    context.value = undefined
  }

  function attachContextListeners(ctx: WsEventContext) {
    contextDisposers.push(ctx.on(newMessages, (event) => {
      const payload = event.body as NewMessagesPayload | undefined
      if (!payload)
        return
      for (const handler of newMessagesHandlers) {
        try {
          handler(payload)
        }
        catch (err) {
          // Same isolation principle as notifyStatus: one bad listener should
          // not silently drop messages for the rest.
          console.warn('[chat-ws] newMessages handler threw:', errorMessageFrom(err))
        }
      }
    }))

    contextDisposers.push(ctx.on(wsErrorEvent, (event) => {
      console.warn('[chat-ws] socket error:', event.body)
    }))
    // wsConnectedEvent / wsDisconnectedEvent come from the native adapter and
    // mirror what useWebSocket already reports via `status`. We attach to
    // them only so future tracing has hook points.
    contextDisposers.push(ctx.on(wsConnectedEvent, () => {}))
    contextDisposers.push(ctx.on(wsDisconnectedEvent, () => {}))
  }

  // The url-as-ref form lets useWebSocket reconnect when `urlRef` changes
  // (token rotation, disconnect intent). VueUse internally compares the
  // value and reopens; passing `undefined` cleanly closes any open socket.
  const ws = useWebSocket<string>(urlRef, {
    immediate: false,
    autoClose: true,
    autoReconnect: {
      retries,
      delay: r => computeReconnectDelay(r, baseDelay, maxDelay),
    },
    onConnected(rawWs) {
      const created = createWsContext(rawWs)
      context.value = created.context
      attachContextListeners(created.context)
    },
    onDisconnected() {
      disposeContext()
    },
    onError(_rawWs, event) {
      console.warn('[chat-ws] ws error event:', event)
    },
  })

  // Translate VueUse's 3-state status into our 4-state machine and fan it
  // out to the orchestrator. The chat store creates this inside a Pinia
  // setup, which gives us a parent effect scope for `watch` to attach to.
  const stopStatusWatch = watch(
    [ws.status, enabled],
    ([rawStatus, isEnabled]) => notifyStatus(mapStatus(rawStatus, isEnabled)),
    { immediate: true },
  )

  function getContext(): WsEventContext {
    if (!context.value)
      throw new Error('chat-ws not connected')
    return context.value
  }

  // NOTICE:
  // We pass a function so each invoke resolves the *current* context. After a
  // reconnect, `context` is rebuilt; a captured reference would point at a
  // disposed context and the invoke would hang waiting for a response that
  // never arrives.
  // Source: @moeru/eventa@1.0.0-beta.4 dist/src-CTs6h4Ci.mjs:248 — `defineInvoke`'s
  // `getContext` runs on every call when `ctx` is a function.
  // Removal condition: when eventa exposes a public "swap context" API, we
  // can capture an invoke once and let the lib do the swap internally.
  const invokeSendMessages = defineInvoke(getContext, sendMessages)
  const invokePullMessages = defineInvoke(getContext, pullMessages)

  return {
    status: () => mapStatus(ws.status.value, enabled.value),
    connect() {
      if (enabled.value && ws.status.value === 'OPEN')
        return
      enabled.value = true
      // urlRef will recompute and useWebSocket reopens; if it was already
      // closed by a previous disconnect, call open() to nudge it.
      if (ws.status.value === 'CLOSED')
        ws.open()
    },
    disconnect() {
      // Flip intent off first so the autoReconnect loop won't fight us, then
      // ask VueUse to close. urlRef is now `undefined` which makes any
      // future automatic open() a no-op until connect() is called again.
      enabled.value = false
      ws.close()
      disposeContext()
      stopStatusWatch()
    },
    sendMessages: req => invokeSendMessages(req),
    pullMessages: req => invokePullMessages(req),
    onNewMessages(handler) {
      newMessagesHandlers.add(handler)
      return () => {
        newMessagesHandlers.delete(handler)
      }
    },
    onStatusChange(handler) {
      statusHandlers.add(handler)
      return () => {
        statusHandlers.delete(handler)
      }
    },
  }
}
