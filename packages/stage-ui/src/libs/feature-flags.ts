import { array, boolean, object, optional, parse, picklist, record, string } from 'valibot'

export const featureFlagPolicySchema = object({
  key: string(),
  enabled: boolean(),
  source: picklist(['global', 'account']),
  allowLocalOverride: boolean(),
})

export const featureFlagResponseSchema = object({ flags: array(featureFlagPolicySchema) })
export const featureFlagPreferencesSchema = record(string(), boolean())

/** A client-owned experiment. Server policy cannot introduce executable client features. */
export interface ExperimentalFeature {
  key: string
  titleKey: string
  descriptionKey: string
  defaultEnabled: boolean
}

export interface FeatureFlagDecision {
  enabled: boolean
  source: 'default' | 'local' | 'global' | 'account'
  locked: boolean
}

/** Only implemented experiments belong here. An empty catalog produces an empty settings page. */
export const experimentalFeatures: readonly ExperimentalFeature[] = []

/** Account policy wins over device choices. Global policy explicitly controls device overrides. */
export function resolveFeatureFlag(feature: ExperimentalFeature, preference: boolean | undefined, policy: unknown): FeatureFlagDecision {
  const remote = parse(optional(featureFlagPolicySchema), policy)
  if (remote && (remote.source === 'account' || !remote.allowLocalOverride))
    return { enabled: remote.enabled, source: remote.source, locked: true }

  if (preference !== undefined)
    return { enabled: preference, source: 'local', locked: false }

  if (remote)
    return { enabled: remote.enabled, source: 'global', locked: false }

  return { enabled: feature.defaultEnabled, source: 'default', locked: false }
}
