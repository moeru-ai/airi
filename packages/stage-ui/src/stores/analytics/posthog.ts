import type { AboutBuildInfo } from '../../components/scenarios/about/types'

import posthog from 'posthog-js'

import { isStageCapacitor, isStageTamagotchi } from '@proj-airi/stage-shared'

import {
  DEFAULT_POSTHOG_CONFIG,
  POSTHOG_ENABLED,
  POSTHOG_PROJECT_KEY_DESKTOP,
  POSTHOG_PROJECT_KEY_POCKET,
  POSTHOG_PROJECT_KEY_WEB,
} from '../../../../../posthog.config'

let posthogInitialized = false

function getPosthogProjectKey(): string {
  if (isStageTamagotchi())
    return POSTHOG_PROJECT_KEY_DESKTOP

  if (isStageCapacitor())
    return POSTHOG_PROJECT_KEY_POCKET

  return POSTHOG_PROJECT_KEY_WEB
}

export function isPosthogAvailableInBuild(): boolean {
  return POSTHOG_ENABLED
}

export function ensurePosthogInitialized(enabled: boolean): boolean {
  if (!POSTHOG_ENABLED)
    return false

  if (posthogInitialized)
    return true

  posthog.init(getPosthogProjectKey(), {
    ...DEFAULT_POSTHOG_CONFIG,
    opt_out_capturing_by_default: !enabled,
  })
  posthogInitialized = true
  return true
}

export function syncPosthogCapture(enabled: boolean): boolean {
  if (!POSTHOG_ENABLED)
    return false

  if (enabled) {
    ensurePosthogInitialized(true)

    if (posthog.has_opted_out_capturing())
      posthog.opt_in_capturing()

    return true
  }

  if (posthogInitialized && !posthog.has_opted_out_capturing())
    posthog.opt_out_capturing()

  return false
}

export function registerPosthogBuildInfo(buildInfo: AboutBuildInfo): void {
  if (!posthogInitialized)
    return

  posthog.register({
    app_version: (buildInfo.version && buildInfo.version !== '0.0.0') ? buildInfo.version : 'dev',
    app_commit: buildInfo.commit,
    app_branch: buildInfo.branch,
    app_build_time: buildInfo.builtOn,
  })
}
