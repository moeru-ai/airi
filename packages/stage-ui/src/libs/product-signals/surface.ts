import type { StageEnvironment } from '@proj-airi/stage-shared'

import { getStage } from '@proj-airi/stage-shared'

const apps = {
  web: { surface: 'web', client: 'stage-web' },
  capacitor: { surface: 'mobile', client: 'stage-pocket' },
  tamagotchi: { surface: 'desktop', client: 'stage-tamagotchi' },
} as const satisfies Record<`${StageEnvironment}`, { surface: string, client: string }>

type App = typeof apps[keyof typeof apps]

/**
 * Kind of device that a stage app runs on: the `app_surface` property of each product event, and the `platform`
 * property of `app_loaded`. Several client apps can have the same surface.
 */
export type AnalyticsSurface = App['surface']

/** Client app that sends a product event: the `app_client` property. Add a value for each new client app. */
export type AnalyticsClient = App['client']

/**
 * Gets the surface of the running stage app for product events.
 *
 * Desktop versions up to 0.15.2 report `electron`. In a report, read `electron` and `desktop` as the same surface.
 */
export function analyticsSurface(): AnalyticsSurface {
  return apps[getStage()].surface
}

/** Gets the client app name of the running stage app for product events. */
export function analyticsClient(): AnalyticsClient {
  return apps[getStage()].client
}
