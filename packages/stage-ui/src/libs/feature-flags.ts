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
  mode: 'local' | 'cloud-opt-in' | 'cloud-controlled'
}

export interface FeatureFlagDecision {
  enabled: boolean
  source: 'default' | 'local' | 'global' | 'account'
  selectable: boolean
}

/** Only implemented experiments belong here. An empty catalog produces an empty settings page. */
export const featureFlags: readonly FeatureFlag[] = []

/** Missing cloud grants disable features. Only local and account-granted opt-in features expose settings. */
export function resolveFeatureFlag(feature: FeatureFlag, preference: boolean | undefined, policy: InferOutput<typeof featureFlagPolicySchema> | undefined, authenticated: boolean): FeatureFlagDecision {
  if (feature.mode === 'local')
    return { enabled: preference ?? feature.defaultEnabled, source: preference === undefined ? 'default' : 'local', selectable: true }

  if (!policy || policy.key !== feature.key || policy.mode !== feature.mode)
    return { enabled: false, source: 'default', selectable: false }

  if (feature.mode === 'cloud-controlled')
    return { enabled: true, source: policy.source, selectable: false }

  if (!authenticated)
    return { enabled: false, source: 'default', selectable: false }

  return { enabled: preference ?? false, source: preference === undefined ? policy.source : 'local', selectable: true }
}
