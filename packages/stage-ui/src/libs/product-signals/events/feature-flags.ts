import type { FeatureFlagDecision } from '../../feature-flags'

import { getStage } from '@proj-airi/stage-shared'

import { useSettingsAnalytics } from '../../../stores/settings/analytics'
import { captureAnalyticsEvent, enableAnalyticsCapture, isAnalyticsAvailableInBuild } from '../client'

/** Records explicit choices and actual feature exposure through the existing consent boundary. */
export function captureFeatureFlagEvent(
  event: 'feature_flag_changed' | 'feature_flag_exposed',
  key: string,
  decision: FeatureFlagDecision,
  preference?: boolean | null,
): boolean {
  if (!useSettingsAnalytics().analyticsEnabled || !isAnalyticsAvailableInBuild() || !enableAnalyticsCapture())
    return false

  return captureAnalyticsEvent(event, {
    feature_key: key,
    enabled: decision.enabled,
    source: decision.source,
    environment: getStage(),
    ...(preference !== undefined ? { preference } : {}),
  })
}
