import { readonly, shallowRef } from 'vue'

export type CaptionChannelEvent
  = | { type: 'caption-speaker', text: string }
    | { type: 'caption-assistant', text: string }

export interface CaptionItem {
  /** Stable render key and timer owner for one broadcast caption event. */
  id: number
  /** Caption source, used for styling and explicit type-level clears. */
  type: CaptionChannelEvent['type']
  /** Text payload rendered by the overlay. */
  text: string
}

export interface UseCaptionItemsOptions {
  /**
   * How long one caption event should stay visible before removing itself.
   *
   * @default 5000
   */
  ttlMs?: number
}

const defaultCaptionItemsOptions = {
  ttlMs: 5_000,
} satisfies Required<UseCaptionItemsOptions>

/**
 * Manages caption overlay items with per-event expiry.
 *
 * Use when:
 * - Broadcast caption updates should age out independently.
 * - Empty caption events should clear only the matching caption source.
 *
 * Expects:
 * - Callers pass plain caption broadcast events.
 * - Callers call `dispose()` when the owner outlives Vue component cleanup.
 *
 * Returns:
 * - Readonly caption items plus actions for adding events and clearing timers.
 */
export function useCaptionItems(options: UseCaptionItemsOptions = {}) {
  const { ttlMs } = { ...defaultCaptionItemsOptions, ...options }
  const items = shallowRef<CaptionItem[]>([])
  const expiryTimers = new Map<CaptionItem['id'], ReturnType<typeof setTimeout>>()
  let nextId = 1

  function clearTimer(id: CaptionItem['id']) {
    const timer = expiryTimers.get(id)
    if (!timer)
      return

    clearTimeout(timer)
    expiryTimers.delete(id)
  }

  function remove(id: CaptionItem['id']) {
    clearTimer(id)
    items.value = items.value.filter(item => item.id !== id)
  }

  function clearType(type: CaptionChannelEvent['type']) {
    const matchedItems = items.value.filter(item => item.type === type)
    for (const item of matchedItems) {
      clearTimer(item.id)
    }
    items.value = items.value.filter(item => item.type !== type)
  }

  function add(event: CaptionChannelEvent) {
    if (!event.text.trim()) {
      clearType(event.type)
      return
    }

    const item: CaptionItem = {
      id: nextId++,
      type: event.type,
      text: event.text,
    }
    items.value = [...items.value, item]
    expiryTimers.set(item.id, setTimeout(() => {
      remove(item.id)
    }, ttlMs))
  }

  function dispose() {
    for (const timer of expiryTimers.values()) {
      clearTimeout(timer)
    }
    expiryTimers.clear()
    items.value = []
  }

  return {
    items: readonly(items),
    add,
    clearType,
    dispose,
  }
}
