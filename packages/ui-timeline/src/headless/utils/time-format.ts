/** Window lengths that the follow mode grows through. */
const FOLLOW_STEPS_MS = [10_000, 30_000, 60_000, 120_000, 300_000, 600_000, 1_800_000]

/** Space that the follow mode keeps after now. */
export const FOLLOW_LEAD_MS = 4000

/**
 * The window length that follow mode targets: the smallest step that holds the data since `start` plus the lead.
 *
 * @example
 * followWindowMs(1000, 15_000)
 * // => 30_000
 */
export function followWindowMs(start: number, now: number): number {
  const needed = now - start + FOLLOW_LEAD_MS
  return FOLLOW_STEPS_MS.find(step => step >= needed) ?? FOLLOW_STEPS_MS.at(-1)!
}

const TICK_STEPS_MS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000, 1_800_000, 3_600_000, 7_200_000, 21_600_000, 43_200_000, 86_400_000]

/** Width of one character of a tick label at the axis font size, with room for the gap after the label. */
const TICK_CHAR_PX = 6.5
const TICK_GAP_PX = 16

/**
 * The smallest tick interval whose labels do not overlap.
 *
 * Each candidate interval is checked against the width of its own longest label, because a coarse interval has a short
 * label. For example `1:05:00` needs less room than `1:05.250`.
 */
export function tickIntervalMs(windowMs: number, widthPx: number): number {
  const pxPerMs = Math.max(1, widthPx) / Math.max(1, windowMs)
  for (const step of TICK_STEPS_MS) {
    const labelPx = formatTick(windowMs, step).length * TICK_CHAR_PX + TICK_GAP_PX
    if (step * pxPerMs >= labelPx)
      return step
  }
  return TICK_STEPS_MS.at(-1)!
}

/**
 * Formats a tick offset with only the precision that its interval needs.
 *
 * @example
 * formatTick(65_250, 250)
 * // => '1:05.25'
 * formatTick(3_900_000, 300_000)
 * // => '1:05:00'
 */
export function formatTick(ms: number, intervalMs: number): string {
  const sign = ms < 0 ? '-' : ''
  const total = Math.abs(ms)
  const hours = Math.floor(total / 3_600_000)
  const minutes = Math.floor((total % 3_600_000) / 60_000)
  const seconds = (total % 60_000) / 1000
  const decimals = intervalMs >= 1000 ? 0 : intervalMs >= 100 ? 1 : intervalMs >= 10 ? 2 : 3
  const secondText = seconds.toFixed(decimals)
  if (hours > 0)
    return `${sign}${hours}:${String(minutes).padStart(2, '0')}:${secondText.padStart(decimals ? 3 + decimals : 2, '0')}`
  if (minutes > 0)
    return `${sign}${minutes}:${secondText.padStart(decimals ? 3 + decimals : 2, '0')}`
  return `${sign}${secondText}s`
}

/**
 * Formats a time relative to the timeline start.
 *
 * @example
 * formatOffset(65_432)
 * // => '1:05.432'
 */
export function formatOffset(ms: number): string {
  const sign = ms < 0 ? '-' : ''
  const total = Math.abs(ms)
  const minutes = Math.floor(total / 60_000)
  const seconds = (total % 60_000) / 1000
  return minutes > 0 ? `${sign}${minutes}:${seconds.toFixed(3).padStart(6, '0')}` : `${sign}${seconds.toFixed(3)}s`
}

/**
 * Formats a duration.
 *
 * @example
 * formatDuration(1234.5)
 * // => '1.23 s'
 */
export function formatDuration(ms: number): string {
  if (ms < 1)
    return `${ms.toFixed(2)} ms`
  if (ms < 1000)
    return `${Math.round(ms)} ms`
  return `${(ms / 1000).toFixed(2)} s`
}
