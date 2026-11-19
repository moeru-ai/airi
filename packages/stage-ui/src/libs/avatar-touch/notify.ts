import type { WebSocketEventOf } from '@proj-airi/server-sdk'

/** A part of the avatar that a pointer touched. */
export type AvatarTouchRegion = 'body' | 'head'

/** One touch that a renderer recognized, for example a Live2D tap or pat. */
export interface AvatarTouch {
  region: AvatarTouchRegion
  gesture: 'pat' | 'tap'
}

/** The touches of one region in one burst. */
export interface AvatarTouchSummary {
  region: AvatarTouchRegion
  taps: number
  pats: number
}

/** Quiet time after the last touch that ends a burst, in milliseconds. */
export const avatarTouchSettleMs = 1500
/** Shortest time between two notifications for one region, in milliseconds. */
export const avatarTouchCooldownMs = 20_000

/**
 * Collects touches into bursts, one summary for each touched region.
 *
 * A rub over the head gives many pats, and a user can tap several times in a
 * row. The character must hear about this once, not once for each touch. Each
 * touch restarts a quiet timer. When no touch comes for `settleMs`, the burst
 * ends, and `onSummary` receives the counts of each region that the burst
 * touched.
 */
export function createAvatarTouchAggregator(options: {
  onSummary: (summary: AvatarTouchSummary) => void
  settleMs?: number
  setTimer?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  clearTimer?: (handle: ReturnType<typeof setTimeout>) => void
}) {
  const settleMs = options.settleMs ?? avatarTouchSettleMs
  const setTimer = options.setTimer ?? ((callback, delayMs) => setTimeout(callback, delayMs))
  const clearTimer = options.clearTimer ?? (handle => clearTimeout(handle))
  const burst = new Map<AvatarTouchRegion, AvatarTouchSummary>()
  let timer: ReturnType<typeof setTimeout> | undefined

  function flush() {
    timer = undefined
    const summaries = [...burst.values()]
    burst.clear()
    summaries.forEach(summary => options.onSummary(summary))
  }

  function record(touch: AvatarTouch) {
    const summary = burst.get(touch.region) ?? { region: touch.region, taps: 0, pats: 0 }
    if (touch.gesture === 'pat')
      summary.pats += 1
    else
      summary.taps += 1
    burst.set(touch.region, summary)

    if (timer !== undefined)
      clearTimer(timer)
    timer = setTimer(flush, settleMs)
  }

  /** Drops the current burst without a summary. */
  function dispose() {
    if (timer !== undefined)
      clearTimer(timer)
    timer = undefined
    burst.clear()
  }

  return { record, dispose }
}

/**
 * Allows one notification for each region in each `cooldownMs`.
 *
 * A user can keep touching the avatar for fun. Without a cooldown, each burst
 * would start a model request and a spoken reply.
 */
export function createAvatarTouchCooldown(cooldownMs = avatarTouchCooldownMs) {
  const lastAllowedAt = new Map<AvatarTouchRegion, number>()

  return {
    allow(region: AvatarTouchRegion, nowMs: number): boolean {
      const last = lastAllowedAt.get(region)
      if (last !== undefined && nowMs - last < cooldownMs)
        return false
      lastAllowedAt.set(region, nowMs)
      return true
    },
  }
}

function times(count: number) {
  return count === 1 ? 'once' : `${count} times`
}

/**
 * Describes a touch burst to the character as a `spark:notify` event.
 *
 * The headline says what the user did in plain words, because the character
 * model reads it. The payload keeps the counts for tools and traces.
 */
export function toAvatarTouchSparkNotify(summary: AvatarTouchSummary, id: string): WebSocketEventOf<'spark:notify'> {
  const actions: string[] = []
  if (summary.region === 'head') {
    if (summary.pats > 0)
      actions.push(`patted your head (${times(summary.pats)})`)
    if (summary.taps > 0)
      actions.push(`tapped your head (${times(summary.taps)})`)
  }
  else {
    if (summary.taps > 0)
      actions.push(`poked your body (${times(summary.taps)})`)
    if (summary.pats > 0)
      actions.push(`stroked your body (${times(summary.pats)})`)
  }

  return {
    type: 'spark:notify',
    source: 'character:avatar-touch',
    data: {
      id,
      eventId: id,
      kind: 'ping',
      urgency: 'immediate',
      headline: `The user ${actions.join(' and ')}.`,
      note: 'The user touched your avatar in the app with the pointer. You can react in character, briefly, or stay quiet.',
      payload: { ...summary },
      destinations: ['character'],
    },
  }
}
