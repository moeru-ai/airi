import type { NewMessagesPayload, PullMessagesRequest, PullMessagesResponse, SendMessagesRequest, SendMessagesResponse } from '@proj-airi/server-sdk-shared'

import { defineInvoke } from '@moeru/eventa'
import { createContext as createWsContext, wsErrorEvent } from '@moeru/eventa/adapters/websocket/native'
import { errorMessageFrom } from '@moeru/std'
import { newMessages, pullMessages, sendMessages } from '@proj-airi/server-sdk-shared'
import { useWebSocket } from '@vueuse/core'
import { computed, ref, shallowRef, watch } from 'vue'

import * as v from 'valibot'

import { createPendingTracker } from './pending-tracker'

const RECONNECT_BASE_MS = 1000
const RECONNECT_MAX_MS = 30_000
const RECONNECT_RETRIES = -1

// NOTICE:
// The native ws adapter's context type is not directly exported from
// `@moeru/eventa/adapters/websocket/native`; use the inferred return type so
// `ctx.on` / `ctx.emit` overloads stay accurate.
// Source: @moeru/eventa@0.3.0 — adapter exports only `createContext` and the
// event constants.
// Removal condition: the adapter exports a public `EventContext` type.
type WsEventContext = ReturnType<typeof createWsContext>['context']

const NewMessagesPayloadSchema = v.object({
  chatId: v.pipe(v.string(), v.minLength(1)),
  fromSeq: v.number(),
  toSeq: v.number(),
  messages: v.array(v.object({
    id: v.pipe(v.string(), v.minLength(1)),
    chatId: v.pipe(v.string(), v.minLength(1)),
    senderId: v.nullable(v.string()),
    role: v.picklist(['system', 'user', 'assistant', 'tool', 'error']),
    content: v.string(),
    seq: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })),
})

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
}

export interface ChatWsClient {
  /** Current connection status. Useful for UI banners. */
  status: () => ChatWsStatus
  /** Connect (or reconnect with the latest token). No-op if already open. */
  connect: () => void
  /** Close the socket and stop auto-reconnect until the next `connect()`. The handle is reusable. */
  disconnect: () => void
  /** Permanently dispose the client (stops the status watcher). After `destroy()` the handle is unusable. */
  destroy: () => void
  /** RPC: push messages to a chat. Rejects if disconnected mid-flight. */
  sendMessages: (req: SendMessagesRequest) => Promise<SendMessagesResponse>
  /** RPC: pull messages newer than `afterSeq`. Rejects if disconnected mid-flight. */
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
 *
 * @internal
 */
export function buildChatWsUrl(serverUrl: string, token: string): string {
  // Use URL parsing instead of string concat so trailing slashes / paths in
  // serverUrl are normalized cleanly.
  const url = new URL(serverUrl)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/+$/, '')}/ws/chat`
  url.searchParams.set('token', token)
  return url.toString()
}

/**
 * Compute exponential reconnect delay with bounded jitter.
 *
 * Math context: VueUse's autoReconnect supplies `retries` starting at 1 for
 * the first reconnect. The minimum 50% floor keeps the immediate retry from
 * firing in <50ms (a 0..exp uniform jitter previously could fire at ~0ms,
 * producing reconnect storms across many tabs against a hard-down server).
 *
 * @internal
 */
export function computeReconnectDelay(retries: number, baseMs: number, maxMs: number): number {
  const exp = Math.min(maxMs, baseMs * 2 ** Math.max(0, retries - 1))
  // 50% floor + 50% jitter window; total range is [exp/2, exp).
  return Math.floor(exp * 0.5 + Math.random() * exp * 0.5)
}

/**
 * Map VueUse's 3-state status onto the chat-sync 4-state machine.
 *
 * VueUse exposes `OPEN | CONNECTING | CLOSED`. Chat-sync needs to distinguish
 * "never connected / explicitly disconnected" (`idle`) from "lost the socket
 * and auto-reconnect is pending" (`closed`). The caller tracks the user
 * intent via `enabled`; here we just translate the transport state.
 *
 * @internal
 */
export function mapStatus(vue: 'OPEN' | 'CONNECTING' | 'CLOSED', enabled: boolean): ChatWsStatus {
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
 * - A handle exposing connect/disconnect/destroy, RPC functions, and event
 *   hooks. RPC closures resolve the live `EventContext` per invocation so a
 *   reconnect-induced context swap is transparent. In-flight RPCs reject on
 *   disconnect with `chat-ws: rpc cancelled` so callers do not hang
 *   indefinitely (eventa@0.3.0 does not flush its internal pending maps when
 *   the underlying context is disposed; we wrap each invoke in a race).
 */
export function createChatWsClient(options: CreateChatWsClientOptions): ChatWsClient {
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

  // Pending RPC reject callbacks — drained on context disposal so callers
  // do not hang waiting for a response that will never arrive.
  // NOTICE:
  // eventa@0.3.0 stores per-invoke promise resolvers in a closure-scoped Map
  // and registers per-RPC ctx.on listeners on the live context. Disposing
  // the context detaches the underlying socket but does not drain those
  // resolvers. We wrap each invoke call in a `PendingTracker` that the
  // disposeContext can flush.
  // Source: @moeru/eventa@0.3.0 dist/src-Bb-vxm5k.mjs:62-99 — `defineInvoke`'s
  // `mInvokeIdPromiseResolvers / mInvokeIdPromiseRejectors`.
  // Removal condition: when eventa exposes a public flush/dispose API on the
  // invoke handle, drop this wrapper.
  const pendingRpcs = createPendingTracker()

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

    // Reject every in-flight RPC so callers do not hang on a context that
    // is now detached from any live socket.
    pendingRpcs.drainAll(new Error('chat-ws: rpc cancelled (socket disconnected)'))
  }

  function attachContextListeners(ctx: WsEventContext) {
    contextDisposers.push(ctx.on(newMessages, (event) => {
      // External boundary: validate the wire payload before fanning it out.
      // A malformed server push would otherwise flow unchecked into every
      // subscriber and into `mergeCloudMessagesIntoSession`.
      const result = v.safeParse(NewMessagesPayloadSchema, event.body)
      if (!result.success) {
        console.warn('[chat-ws] dropped malformed newMessages payload:', result.issues[0]?.message)
        return
      }
      const payload = result.output
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
  }

  // The url-as-ref form lets useWebSocket reconnect when `urlRef` changes
  // (token rotation, disconnect intent). VueUse internally compares the
  // value and reopens; passing `undefined` cleanly closes any open socket.
  const ws = useWebSocket<string>(urlRef, {
    immediate: false,
    autoClose: true,
    autoReconnect: {
      retries: RECONNECT_RETRIES,
      delay: r => computeReconnectDelay(r, RECONNECT_BASE_MS, RECONNECT_MAX_MS),
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
  // NOTICE:
  // We intentionally do NOT stop this watcher in `disconnect()`; previous
  // behavior killed it permanently and any caller that did `disconnect()`
  // followed by `connect()` silently stopped receiving status events. The
  // watcher is idle while the socket is closed, so leaving it attached
  // costs nothing. Use `destroy()` for terminal cleanup.
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

  // We pass a function so each invoke resolves the *current* context. After
  // a reconnect, `context` is rebuilt; a captured reference would point at a
  // disposed context and the invoke would hang waiting for a response that
  // never arrives (see pendingRpcRejects NOTICE for the dispose-flush story).
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
      // Status watcher stays attached so callers can disconnect/connect on
      // the same handle.
      enabled.value = false
      ws.close()
      disposeContext()
    },
    destroy() {
      enabled.value = false
      ws.close()
      disposeContext()
      stopStatusWatch()
    },
    sendMessages: req => pendingRpcs.track(invokeSendMessages(req)),
    pullMessages: req => pendingRpcs.track(invokePullMessages(req)),
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
