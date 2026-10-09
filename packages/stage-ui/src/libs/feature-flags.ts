import type { InferOutput } from 'valibot'

import { array, boolean, object, picklist, record, string } from 'valibot'

export const featureFlagPolicySchema = object({
  key: string(),
  mode: picklist(['cloud-opt-in', 'cloud-controlled']),
  source: picklist(['global', 'account']),
})

export const featureFlagResponseSchema = object({ flags: array(featureFlagPolicySchema) })
export const featureFlagPreferencesSchema = record(string(), boolean())

/** A client-owned experiment. Server policy cannot introduce executable client features. */
export interface FeatureFlag {
  key: string
  titleKey: string
  descriptionKey: string
  defaultEnabled: boolean
  availability: 'local' | 'cloud'
}

export interface FeatureFlagDecision {
  enabled: boolean
  source: 'default' | 'local' | 'global' | 'account'
  selectable: boolean
}

/**
 * Cloud sync for character cards has no server policy. It is a device choice,
 * off by default, so a user opts in before a card leaves the device.
 */
export const CHARACTER_CARD_SYNC_FLAG: FeatureFlag = {
  key: 'character-card-sync',
  titleKey: 'settings.pages.system.experimental.features.character_card_sync.title',
  descriptionKey: 'settings.pages.system.experimental.features.character_card_sync.description',
  defaultEnabled: false,
  availability: 'local',
}

/** Only implemented experiments belong here. An empty catalog produces an empty settings page. */
export const featureFlags: readonly FeatureFlag[] = [CHARACTER_CARD_SYNC_FLAG]

/** Missing cloud grants disable features. Only local and account-granted opt-in features expose settings. */
export function resolveFeatureFlag(feature: FeatureFlag, preference: boolean | undefined, policy: InferOutput<typeof featureFlagPolicySchema> | undefined, authenticated: boolean): FeatureFlagDecision {
  if (feature.availability === 'local')
    return { enabled: preference ?? feature.defaultEnabled, source: preference === undefined ? 'default' : 'local', selectable: true }

  if (!policy || policy.key !== feature.key)
    return { enabled: false, source: 'default', selectable: false }

  if (policy.mode === 'cloud-controlled')
    return { enabled: true, source: policy.source, selectable: false }

  if (!authenticated)
    return { enabled: false, source: 'default', selectable: false }

  return { enabled: preference ?? false, source: preference === undefined ? policy.source : 'local', selectable: true }
}
