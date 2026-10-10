import type { InputActivity, InputSource } from '@proj-airi/core-agent'

import { useEventListener } from '@vueuse/core'
import { defineStore } from 'pinia'

/** A shorter gap between two uses is ordinary work, not an idle time. */
const IDLE_GAP_MS = 60_000

/** What a desktop host reads about input in every app: the system idle time and the cursor position. */
export interface InputProbeReading {
  idleSeconds: number
  cursor: { x: number, y: number }
}

/**
 * When the owner last used the mouse and the keyboard, and each device's latest use after an idle time.
 *
 * Use when:
 * - An automation follows the mouse or the keyboard.
 *
 * Expects:
 * - A desktop host registers a probe, which sees input in every app. A moved cursor counts as the mouse. Other input,
 *   such as typing, a click, or a scroll without a move, counts as the keyboard. Without a probe, only input in this window counts.
 *
 * Returns:
 * - `inputs`, which reads the current activity, and `sample`, which reads the probe. The automation check calls both on its tick.
 */
export const useOwnerActivityStore = defineStore('owner-activity', () => {
  // The automation check reads these on its tick, so they stay plain values instead of reactive state.
  const activity: Partial<Record<InputSource, InputActivity>> = {}
  let probe: (() => Promise<InputProbeReading>) | undefined
  let lastInputAt: number | undefined
  let lastCursor: InputProbeReading['cursor'] | undefined

  /** Records a use of a device. A use after a gap of at least a minute also records the idle time before it. */
  function markActive(source: InputSource, at: number) {
    const current = activity[source]
    if (current?.lastAt !== undefined && at <= current.lastAt)
      return
    const idleMs = current?.lastAt === undefined ? undefined : at - current.lastAt
    activity[source] = {
      lastAt: at,
      lastReturn: idleMs !== undefined && idleMs >= IDLE_GAP_MS ? { at, idleMs } : current?.lastReturn,
    }
  }

  /** Registers the host's probe. Returns a function that removes it. */
  function useInputProbe(next: () => Promise<InputProbeReading>) {
    probe = next
    return () => {
      if (probe === next)
        probe = undefined
    }
  }

  /** Reads the probe once. The first reading only sets the baseline. A failed read changes nothing. */
  async function sample(now: number) {
    const reading = await probe?.().catch(() => undefined)
    if (!reading || !Number.isFinite(reading.idleSeconds))
      return
    const inputAt = now - reading.idleSeconds * 1000
    const known = lastInputAt !== undefined && lastCursor !== undefined
    const moved = known && (reading.cursor.x !== lastCursor!.x || reading.cursor.y !== lastCursor!.y)
    // The idle time has whole seconds, so a newer input is more than a second later.
    const newInput = known && inputAt > lastInputAt! + 1000
    lastCursor = reading.cursor
    lastInputAt = Math.max(lastInputAt ?? inputAt, inputAt)
    if (moved)
      markActive('mouse', inputAt)
    else if (newInput)
      markActive('keyboard', inputAt)
  }

  function inputs(): Partial<Record<InputSource, InputActivity>> {
    return structuredClone(activity)
  }

  useEventListener('pointermove', () => markActive('mouse', Date.now()), { passive: true, capture: true })
  useEventListener('pointerdown', () => markActive('mouse', Date.now()), { passive: true, capture: true })
  useEventListener('wheel', () => markActive('mouse', Date.now()), { passive: true, capture: true })
  useEventListener('keydown', () => markActive('keyboard', Date.now()), { passive: true, capture: true })

  return {
    markActive,
    useInputProbe,
    sample,
    inputs,
  }
})
