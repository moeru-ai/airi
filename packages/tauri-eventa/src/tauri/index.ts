import type { EventaContractLike } from './pubsub'
import type { IpcRendererLike, TauriInternals } from './types'

import type { InvokeEventa } from '@moeru/eventa'
import { createContext as createElectronContext } from '@moeru/eventa/adapters/electron/renderer'
import { defineInvoke } from '@moeru/eventa'

import { emitTauriEvent, subscribeTauriEvent, tauriEventNameFromContract } from './pubsub'

// Re-export the pubsub adapter so renderer code can subscribe to Tauri's
// native `@tauri-apps/api/event` bus through the same module that owns the
// invoke-style eventa context. Orthogonal to the IPC shim below.
export {
  emitTauriEvent,
  type EventaContractLike,
  tauriEventNameFromContract,
  tauriEventPubSub,
  type TauriEventSubscriber,
} from './pubsub'
export { subscribeTauriEvent } from './pubsub'

export type { IpcRendererLike, IpcRendererMessage, TauriInternals } from './types'

/**
 * Channel names used by the eventa protocol for transport envelopes.
 * Electron's main/renderer adapter uses these to multiplex eventa envelopes
 * over a single IPC channel. We keep the same names so the existing eventa
 * protocol contracts still apply on the Tauri side — no Rust rename needed.
 */
export const TauriMessageEventName = 'eventa-message'
export const TauriPushEventName = 'eventa-push'
export const TauriErrorEventName = 'eventa-error'

/**
 * Wrap a Tauri internals object (`window.__TAURI_INTERNALS__`) into the
 * `IpcRenderer`-like surface required by `@moeru/eventa/adapters/electron/renderer`.
 *
 * Required shape:
 *   - send(channel, ...args): fire-and-forget outbound message
 *   - invoke(channel, ...args): request/response, returns Promise
 *   - on(channel, listener) / removeListener(channel, listener)
 *
 * The Tauri `ipc` module uses numeric callbacks, not channel subscriptions,
 * so the wrapper bridges that gap:
 *   • outbound (send): posts a Tauri message through the raw IPC bus and ignores
 *     the callback — the fire-and-forget semantics mirrors electron's send().
 *   • inbound  (on): registers synchronous per-channel subscription on top of the
 *     callback registry. Incoming Rust messages addressed to a channel are
 *     routed to subscribers registered via `on(channel, ...)`.
 */
export function buildIpcRendererLike(internals: TauriInternals): IpcRendererLike {
  const channelListeners = new Map<string, Set<Function>>()
  const subscriptionById = new Map<number, { channel: string; off: () => void }>()

  // Helper: find the stored subscription entry (and its bridge id) for a given
  // channel name. Iteration is O(subscriptions); the number of distinct
  // channels is bounded and small, so a linear scan is fine here.
  const findSubscriptionByChannel = (channel: string): { bridge: number; off: () => void } | undefined => {
    for (const [bridge, entry] of subscriptionById) {
      if (entry.channel === channel) return { bridge, off: entry.off }
    }
    return undefined
  }

  // Lazily-created shared dummy callback for fire-and-forget `post()`.
  // Rust never invokes this (post is send-and-forget), so registering a new
  // throwaway callback per call would leak entries in the JS callback registry
  // forever. We create ONE persistent callback (once=false) and reuse it for
  // both the `callback` and `error` slots of every `post()` invocation.
  let sharedPostCallback: number | undefined

  const post = (channel: string, ...args: any[]) => {
    // Fire-and-forget through Tauri's raw ipc bus — a single shared callback
    // keeps the message balanced on the invoke protocol without awaiting
    // response and without leaking a new callback registration per call.
    if (sharedPostCallback === undefined) {
      sharedPostCallback = internals.transformCallback(() => {}, false)
    }
    internals.ipc({
      cmd: channel,
      callback: sharedPostCallback,
      error: sharedPostCallback,
      payload: args[0],
    })
  }

  const invoke = (cmd: string, ...args: any[]): Promise<any> => {
    return internals.invoke(cmd, args[0])
  }

  const on = (channel: string, listener: Function): (() => void) => {
    let bucket = channelListeners.get(channel)
    if (!bucket) {
      bucket = new Set()
      channelListeners.set(channel, bucket)

      // Bridge: register a transformCallback so any Rust message that arrives
      // with `cmd === channel` is forwarded to the listener set above. Tauri
      // routes response messages by callback ID, not channel name, so the
      // Rust side should fire the callback it received with the same channel
      // id; the wrapper then fans out to every listener on that channel.
      const bridge = internals.transformCallback((data: any) => {
        for (const l of bucket!) {
          l(data)
        }
      }, false)

      const offFn = () => {
        channelListeners.delete(channel)
        subscriptionById.delete(bridge)
        try {
          internals.unregisterCallback(bridge)
        } catch {
          // ignore — transformCallback may have been cleaned up already
        }
      }
      subscriptionById.set(bridge, { channel, off: offFn })
    }

    bucket.add(listener)

    return () => {
      bucket?.delete(listener)
    }
  }

  const removeListener = (channel: string, listener: Function) => {
    const bucket = channelListeners.get(channel)
    if (!bucket) return

    bucket.delete(listener)

    // When the last listener for a channel is removed, unregister the native
    // bridge callback so we stop receiving Rust messages for this channel and
    // the callback registry entry is freed. Routing through the stored `offFn`
    // ensures `internals.unregisterCallback(bridge)` is invoked and the
    // `subscriptionById` / `channelListeners` entries are cleaned up.
    if (bucket.size === 0) {
      const entry = findSubscriptionByChannel(channel)
      if (entry) entry.off()
    }
  }

  const removeAllListeners = (channel: string) => {
    // Look up the bridge for this channel and unregister it from the native
    // callback registry before deleting our local bookkeeping maps. Routing
    // through the stored `offFn` calls `internals.unregisterCallback(bridge)`.
    const entry = findSubscriptionByChannel(channel)
    if (entry) entry.off()
    else channelListeners.delete(channel)
  }

  return {
    on,
    send: post,
    invoke,
    removeListener,
    removeAllListeners,
    once: (channel: string, listener: Function) => {
      const off = on(channel, (...args: any[]) => {
        off()
        ;(listener as any)(...args)
      })
      return off
    },
    sendSync: () => {
      throw new Error('Tauri ipcRenderer synchronous send is not supported.')
    },
    sendTo: () => {
      throw new Error('Tauri ipcRenderer.sendTo() is not supported. Use WebviewWindow::emit_to from Rust.')
    },
    sendToHost: () => {
      throw new Error('Tauri ipcRenderer.sendToHost() is not supported. Use WebviewWindow::emit_to from Rust.')
    },
    postMessage: () => {
      throw new Error('Tauri ipcRenderer.postMessage() is not supported. Use Channel from @tauri-apps/api/core.')
    },
  } as unknown as IpcRendererLike
}

/** Result type from `createContext`. */
export interface TauriEventaContext {
  context: ReturnType<typeof createElectronContext>['context']
  dispose: (reason?: unknown) => void
}

type EventaContext = ReturnType<typeof createElectronContext>['context']
type EventaHandler = (...args: any[]) => void
type NativeInvokeEvent = EventaContractLike & {
  invokeType: number
}

const SEND_INVOKE_TYPE = 0

function eventaInvokeIdToTauriCommand(eventId: string): string | undefined {
  if (!eventId.startsWith('eventa:invoke:electron:') || !eventId.endsWith('-send')) {
    return undefined
  }

  return eventId.slice('eventa:invoke:'.length, -'-send'.length).replace(/[:-]/g, '_')
}

function isTauriNativeEvent(event: unknown): event is EventaContractLike {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as any).type === 'event' &&
    typeof (event as any).id === 'string' &&
    (event as any).id.startsWith('eventa:event:electron:')
  )
}

function isTauriNativeInvokeSendEvent(event: unknown): event is NativeInvokeEvent {
  return (
    typeof event === 'object' &&
    event !== null &&
    (event as any).type === 'event' &&
    (event as any).invokeType === SEND_INVOKE_TYPE &&
    typeof (event as any).id === 'string' &&
    eventaInvokeIdToTauriCommand((event as any).id) !== undefined
  )
}

function attachTauriNativeEventBridge(context: EventaContext, internals: TauriInternals): () => void {
  const originalOn = context.on.bind(context)
  const originalOnce = context.once.bind(context)
  const originalOff = context.off.bind(context)
  const originalEmit = context.emit.bind(context)
  const subscriptions = new Map<string, Map<EventaHandler, () => void>>()

  const remember = (eventId: string, handler: EventaHandler, cleanup: () => void) => {
    let handlers = subscriptions.get(eventId)
    if (!handlers) {
      handlers = new Map()
      subscriptions.set(eventId, handlers)
    }
    handlers.set(handler, cleanup)
  }

  const forget = (eventId: string, handler?: EventaHandler) => {
    const handlers = subscriptions.get(eventId)
    if (!handlers) return

    if (handler) {
      handlers.get(handler)?.()
      handlers.delete(handler)
    } else {
      for (const cleanup of [...handlers.values()]) {
        cleanup()
      }
      handlers.clear()
    }

    if (handlers.size === 0) subscriptions.delete(eventId)
  }

  const subscribeNative = (
    event: EventaContractLike,
    handler: EventaHandler,
    once: boolean,
    onNativeOnce?: () => void,
  ) => {
    let disposed = false
    let nativeCleanup: (() => void) | undefined

    const cleanup = () => {
      if (disposed) return

      disposed = true
      nativeCleanup?.()

      const handlers = subscriptions.get(event.id)
      handlers?.delete(handler)
      if (handlers?.size === 0) subscriptions.delete(event.id)
    }

    void subscribeTauriEvent(event, (payload) => {
      if (disposed) return

      handler({ ...event, body: payload }, { raw: { tauriEvent: true } })
      if (once) {
        onNativeOnce?.()
        cleanup()
      }
    })
      .then((off) => {
        if (disposed) {
          off()
        } else {
          nativeCleanup = off
        }
      })
      .catch((err) => {
        if (!disposed) console.error('[tauri-eventa] failed to subscribe to native event', event.id, err)
      })

    remember(event.id, handler, cleanup)
    return cleanup
  }

  context.on = ((eventOrMatchExpression: any, handler: EventaHandler) => {
    const localCleanup = originalOn(eventOrMatchExpression, handler)
    if (!isTauriNativeEvent(eventOrMatchExpression)) return localCleanup

    const nativeCleanup = subscribeNative(eventOrMatchExpression, handler, false)
    return () => {
      localCleanup()
      nativeCleanup()
    }
  }) as typeof context.on

  context.once = ((eventOrMatchExpression: any, handler: EventaHandler) => {
    const localCleanup = originalOnce(eventOrMatchExpression, handler)
    if (!isTauriNativeEvent(eventOrMatchExpression)) return localCleanup

    const nativeCleanup = subscribeNative(eventOrMatchExpression, handler, true, localCleanup)
    return () => {
      localCleanup()
      nativeCleanup()
    }
  }) as typeof context.once

  context.off = ((eventOrMatchExpression: any, handler?: EventaHandler) => {
    originalOff(eventOrMatchExpression, handler)
    if (isTauriNativeEvent(eventOrMatchExpression)) forget(eventOrMatchExpression.id, handler)
  }) as typeof context.off

  context.emit = ((event: any, payload?: any, options?: any) => {
    if (isTauriNativeInvokeSendEvent(event)) {
      const command = eventaInvokeIdToTauriCommand(event.id)
      const invokeId = payload?.invokeId
      const receiveBaseId = event.id.slice(0, -'-send'.length)

      if (!command || typeof invokeId !== 'string') return

      void internals
        .invoke(command, payload.content)
        .then((content) => {
          originalEmit(
            { id: `${receiveBaseId}-receive-${invokeId}`, type: 'event', _flowDirection: 'inbound' },
            { invokeId, content },
            options,
          )
        })
        .catch((error) => {
          originalEmit(
            { id: `${receiveBaseId}-receive-error-${invokeId}`, type: 'event', _flowDirection: 'inbound' },
            { invokeId, content: { error } },
            options,
          )
        })
      return
    }

    if (!isTauriNativeEvent(event)) return originalEmit(event, payload, options)

    void emitTauriEvent(tauriEventNameFromContract(event), payload)
  }) as typeof context.emit

  return () => {
    for (const eventId of [...subscriptions.keys()]) {
      forget(eventId)
    }
  }
}

/**
 * Build an eventa context from a user-supplied Tauri internals object.
 *
 * The shape of `internals` is `window.__TAURI_INTERNALS__`, which exposes the
 * low-level IPC bus that drives both the Tauri invoke() responses and
 * `transformCallback`-based in-messages.
 */
export function createContextFromTauriIpc(internals: TauriInternals): TauriEventaContext {
  const ipcRenderer = buildIpcRendererLike(internals)

  const result = createElectronContext(ipcRenderer as any, {
    messageEventName: TauriMessageEventName,
    pushEventName: TauriPushEventName,
    errorEventName: TauriErrorEventName,
  })
  const disposeNativeEvents = attachTauriNativeEventBridge(result.context, internals)

  return {
    context: result.context,
    dispose(reason?: unknown) {
      disposeNativeEvents()
      result.dispose(reason)
    },
  }
}

/**
 * Convenience: resolve `window.__TAURI_INTERNALS__` at call time and produce a
 * context.
 *
 * Throws when Tauri internals cannot be resolved (e.g. the script is loaded
 * outside the Tauri webview). This signals a misconfiguration rather than a
 * runtime IPC failure.
 */
export function setupTauriEventaContext(
  window?: Window & { __TAURI_INTERNALS__?: TauriInternals },
): TauriEventaContext {
  const w = window ?? globalThis.window
  const internal = w?.__TAURI_INTERNALS__
  if (!internal) {
    throw new Error('Tauri IPC is not available. Ensure @tauri-apps/api is initialized.')
  }
  return createContextFromTauriIpc(internal as TauriInternals)
}

export function useTauriEventaInvoke<Res, Req = undefined, ResErr = Error, ReqErr = Error>(
  invoke: InvokeEventa<Res, Req, ResErr, ReqErr>,
  context?: EventaContext,
) {
  return defineInvoke(context ?? setupTauriEventaContext().context, invoke)
}
