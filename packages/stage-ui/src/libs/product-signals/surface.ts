import type { StageEnvironment } from '@proj-airi/stage-shared'

import { getStage } from '@proj-airi/stage-shared'

const surfaces = {
  web: 'web',
  capacitor: 'mobile',
  tamagotchi: 'desktop',
} as const satisfies Record<`${StageEnvironment}`, string>

/**
 * Name of a stage app in product events: the `app_surface` property of each event, and the `platform` property of
 * `app_loaded`.
 */
export type AnalyticsSurface = typeof surfaces[keyof typeof surfaces]

/**
 * Gets the name of the running stage app for product events.
 *
 * Desktop versions up to 0.15.2 report `electron`. In a report, read `electron` and `desktop` as the same app.
 */
export function analyticsSurface(): AnalyticsSurface {
  return surfaces[getStage()]
}
