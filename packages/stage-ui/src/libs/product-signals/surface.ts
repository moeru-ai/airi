import { getStage, StageEnvironment } from '@proj-airi/stage-shared'

const surfaces = {
  [StageEnvironment.Web]: 'web',
  [StageEnvironment.Capacitor]: 'mobile',
  [StageEnvironment.Tamagotchi]: 'electron',
} as const satisfies Record<StageEnvironment, string>

const platforms = {
  [StageEnvironment.Web]: 'web',
  [StageEnvironment.Capacitor]: 'mobile',
  [StageEnvironment.Tamagotchi]: 'desktop',
} as const satisfies Record<StageEnvironment, string>

/** Value of the `app_surface` property that each product event of a stage app has. */
export type AnalyticsSurface = typeof surfaces[StageEnvironment]

/** Value of the `platform` property of the `app_loaded` event. */
export type AnalyticsPlatform = typeof platforms[StageEnvironment]

/** Gets the `app_surface` value of the running stage app. */
export function analyticsSurface(): AnalyticsSurface {
  return surfaces[getStage()]
}

/** Gets the `platform` value of the running stage app. */
export function analyticsPlatform(): AnalyticsPlatform {
  return platforms[getStage()]
}
