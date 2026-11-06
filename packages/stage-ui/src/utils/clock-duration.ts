/**
 * Formats a duration in seconds as a clock reading for recordings, playback, and calls.
 * Partial seconds round down. Negative and non-finite input reads as zero.
 *
 * @example
 * formatClockDuration(75.9)
 * // => '1:15'
 */
export function formatClockDuration(seconds: number) {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`
}
