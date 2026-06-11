import type { TouchEventMessage } from '@proj-airi/server-sdk-shared'

import { isBarePercentage } from '@proj-airi/server-sdk-shared'

/**
 * Pre-localized parts of a humanized progress phrase, ready for i18n
 * interpolation ("还差两节，按当前速度 17:40 能完成").
 */
export interface ProgressPhrase {
  /**
   * Humanized remaining-work text in actionable units ("还差两节").
   * `undefined` when the source text was rejected (e.g. a bare percentage)
   * so callers must fall back to a neutral localized phrase.
   */
  remaining?: string
  /**
   * Localized ETA derived from `etaAt` — time only when the ETA falls on
   * the same day as `now` in the target timezone, date + time otherwise.
   * `undefined` when the ETA is missing or unparsable.
   */
  eta?: string
  /** Pace description passthrough from the contract ("约 20 分钟/节"). */
  pace?: string
  isOffTrack: boolean
}

/** Formatting context for {@link progressPhraseFrom}. */
export interface ProgressPhraseOptions {
  locale: string
  /** Reference time used to decide whether the ETA is "today". */
  now: Date
  /**
   * IANA timezone the task is scheduled in (`TaskSchedule.timezone`).
   * @default the runtime's local timezone
   */
  timeZone?: string
}

// NOTICE: the bare-percentage guard previously lived here as a local
// implementation with decoration-stripping ("进度 75%", "(75%)" were also
// rejected). It moved to @proj-airi/server-sdk-shared so frontend, desktop
// main process, and server all judge progress language through one shared
// implementation — single source of truth beats the stronger local variant.

/**
 * Builds the localized parts of the mandated human progress template
 * (remaining work + ETA at current pace + off-track flag) from a touch
 * message or progress narrative.
 *
 * Use when:
 * - Rendering `TouchEventMessage` / `TaskProgressNarrative` anywhere in the
 *   renderer; components interpolate the parts through i18n keys.
 *
 * Expects:
 * - `message` following the screen-observation contract: `remainingWork` is
 *   already humanized by the producer, `etaAt` is an RFC3339 timestamp.
 * - `options.now` as the reference time for same-day detection (injected for
 *   testability).
 *
 * Returns:
 * - `ProgressPhrase` with `remaining` stripped when it violates the
 *   no-bare-percentage rule, and `eta` localized via `Intl.DateTimeFormat`.
 */
export function progressPhraseFrom(
  message: Pick<TouchEventMessage, 'remainingWork' | 'etaAt' | 'pace' | 'isOffTrack'>,
  options: ProgressPhraseOptions,
): ProgressPhrase {
  const remainingWork = message.remainingWork.trim()
  const remaining = remainingWork && !isBarePercentage(remainingWork) ? remainingWork : undefined

  return {
    remaining,
    eta: formatEta(message.etaAt, options),
    pace: message.pace?.trim() || undefined,
    isOffTrack: message.isOffTrack,
  }
}

function formatEta(etaAt: string | undefined, options: ProgressPhraseOptions): string | undefined {
  if (!etaAt)
    return undefined

  const eta = new Date(etaAt)
  if (Number.isNaN(eta.getTime()))
    return undefined

  // Compare calendar days in the task's timezone, not the runtime's:
  // en-CA yields a stable YYYY-MM-DD key regardless of display locale.
  const dayKeyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: options.timeZone, dateStyle: 'short' })
  const sameDay = dayKeyFormat.format(eta) === dayKeyFormat.format(options.now)

  return new Intl.DateTimeFormat(options.locale, sameDay
    ? { timeZone: options.timeZone, hour: '2-digit', minute: '2-digit', hour12: false }
    : { timeZone: options.timeZone, month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(eta)
}
