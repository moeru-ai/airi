import type { CaptionChannelEvent } from '@proj-airi/stage-shared'

import { readonly, shallowRef } from 'vue'

export interface CaptionItem {
  /** Stable render key and timer owner for one broadcast caption event. */
  id: number
  /** Caption source, used for styling and explicit type-level clears. */
  type: CaptionChannelEvent['type']
  /** Text payload rendered by the overlay. */
  text: string
  /** Native language name for the translation line, for example `中文`. */
  label?: string
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

  function scheduleExpiry(item: CaptionItem) {
    expiryTimers.set(item.id, setTimeout(() => {
      remove(item.id)
    }, ttlMs))
  }

  /**
   * Restarts the expiry countdown of every item with the given type.
   *
   * The translation line is produced while the model generates text, which
   * can be far earlier than the last spoken caption finishes playing. Tie
   * its lifetime to spoken playback events so it does not disappear midway
   * through a long response.
   */
  function keepTypeAlive(type: CaptionChannelEvent['type']) {
    for (const item of items.value.filter(candidate => candidate.type === type)) {
      clearTimer(item.id)
      scheduleExpiry(item)
    }
  }

  function replace(event: CaptionChannelEvent) {
    const matchedItems = items.value.filter(item => item.type === event.type)
    const currentItem = matchedItems.at(-1)
    if (!currentItem) {
      const item: CaptionItem = {
        id: nextId++,
        type: event.type,
        text: event.text,
        ...(event.label ? { label: event.label } : {}),
      }
      items.value = [...items.value, item]
      scheduleExpiry(item)
      return
    }

    for (const item of matchedItems)
      clearTimer(item.id)

    // Reflect the event label exactly. A clear event without text removes
    // the item before this branch, so a replacement always carries a badge.
    const replacement: CaptionItem = {
      ...currentItem,
      text: event.text,
      ...(event.label ? { label: event.label } : { label: undefined }),
    }
    items.value = items.value
      .filter(item => item.type !== event.type || item.id === currentItem.id)
      .map(item => item.id === currentItem.id ? replacement : item)
    scheduleExpiry(replacement)
  }

  function add(event: CaptionChannelEvent) {
    if (!event.text.trim()) {
      clearType(event.type)
      return
    }

    if (event.operation === 'replace') {
      replace(event)
    }
    else {
      const item: CaptionItem = {
        id: nextId++,
        type: event.type,
        text: event.text,
        ...(event.label ? { label: event.label } : {}),
      }
      items.value = [...items.value, item]
      scheduleExpiry(item)
    }

    // Spoken captions arrive while audio plays. Keep the translation line on
    // screen for as long as the spoken line keeps getting playback updates.
    if (event.type === 'caption-assistant')
      keepTypeAlive('caption-assistant-translation')
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
    keepTypeAlive,
    dispose,
  }
}
