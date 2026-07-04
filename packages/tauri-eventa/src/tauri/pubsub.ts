import type { Event, UnlistenFn } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'

/**
 * Per-channel registry of JS callbacks. Removed when the underlying unlisten
 * handle is torn down, see {@link tauriEventPubSub}.
 */
const listeners = new Map<string, Set<(payload: any) => void>>()

/**
 * Per-channel `@tauri-apps/api/event` unlisten handles — exactly one
 * `listen()` call per channel so the renderer fans out to N JS subscribers
 * without multiplying native listeners.
 */
const unlistenHandles = new Map<string, UnlistenFn>()

/** Contract returned by {@link tauriEventPubSub}. Mirrors eventa's `defineEventa` consumer shape. */
export interface TauriEventSubscriber {
  /** Register a callback for the channel; returns an unsubscribe function. */
  subscribe: (callback: (payload: any) => void) => () => void
  /** Remove a previously-registered callback from the channel. */
  unsubscribe: (callback: (payload: any) => void) => void
}

/**
 * Build (or look up the cached) eventa-shaped subscriber for a Tauri event
 * channel.
 *
 * The first subscriber for a channel lazily opens a single
 * `@tauri-apps/api/event` `listen()` subscription; every subsequent
 * `subscribe()` call simply adds a callback to the per-channel set. The
 * native listener is never torn down for the lifetime of the module, which is
 * the safe default for long-lived renderer code.
 */
export async function tauriEventPubSub(eventName: string): Promise<TauriEventSubscriber> {
  let set = listeners.get(eventName)
  if (!set) {
    set = new Set()
    listeners.set(eventName, set)

    // Capture the local reference before going async so the closure below
    // always sees the canonical set (the outer `set` binding is reassigned
    // by the missing branch above, but Tauri callbacks fire later).
    const bucket = set

    // One Tauri listen subscription per channel — fans out to every
    // registered JS callback.
    const unlisten = await listen(eventName, (event: Event<any>) => {
      for (const fn of bucket) {
        try {
          fn(event.payload)
        } catch (err) {
          console.error('[tauri-eventa] handler error', err)
        }
      }
    })
    unlistenHandles.set(eventName, unlisten)
  }

  return {
    subscribe(callback) {
      set.add(callback)
      return () => {
        set.delete(callback)
      }
    },
    unsubscribe(callback) {
      set.delete(callback)
    },
  }
}

/** Minimal shape of an eventa contract accepted by {@link subscribeTauriEvent}. */
export interface EventaContractLike {
  id: string
  type: string
  eventName?: string
}

export function tauriEventNameFromContract(eventaContract: EventaContractLike): string {
  return eventaContract.eventName ?? eventaContract.id.replace(/^eventa:event:/, '')
}

/**
 * Proxy helper: bridge an eventa `defineEventa` contract to a Tauri listen
 * subscription.
 *
 * The Tauri channel name is derived from the contract's `eventName` field
 * when present, otherwise the `eventa:event:` prefix is stripped from the
 * contract `id`. This keeps object identity aligned with the contracts in
 * `src/contracts/` (e.g. `electron:window:bounds`).
 *
 * @returns an unsubscribe function that removes the callback from the channel.
 */
export async function subscribeTauriEvent(
  eventaContract: EventaContractLike,
  callback: (payload: any) => void,
): Promise<() => void> {
  const channel = tauriEventNameFromContract(eventaContract)
  const sub = await tauriEventPubSub(channel)
  const off = sub.subscribe(callback)
  return () => {
    off()
    sub.unsubscribe(callback)
  }
}

/** Emit a Tauri event (fire-and-forget), used by fan-out proxy helpers. */
export async function emitTauriEvent(eventName: string, payload?: any, target = 'all'): Promise<void> {
  await invoke('emit_event', {
    target,
    eventName,
    payload: payload === undefined ? null : payload,
  })
}
