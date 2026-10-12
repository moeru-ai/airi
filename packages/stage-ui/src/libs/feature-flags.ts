import type { InferOutput } from 'valibot'

import { array, boolean, object, picklist, record, string } from 'valibot'

export const featureFlagPolicySchema = object({
  key: string(),
  mode: picklist(['cloud-opt-in', 'cloud-controlled']),
  source: picklist(['global', 'account']),
})

export const featureFlagResponseSchema = object({ flags: array(featureFlagPolicySchema) })
export const featureFlagPreferencesSchema = record(string(), boolean())
export const featureFlagVariantPreferencesSchema = record(string(), string())

/** A client-owned experiment. Server policy cannot introduce executable client features. */
export interface FeatureFlag {
  key: string
  titleKey: string
  descriptionKey: string
  defaultEnabled: boolean
  availability: 'local' | 'cloud'
  /** Only the desktop app has the feature, so other apps neither list nor enable it. */
  desktopOnly?: boolean
  /**
   * The ways to run the feature. They exclude each other, so the user picks one while the feature is on. The first
   * option is the default.
   */
  variants?: {
    titleKey: string
    descriptionKey: string
    options: readonly { value: string, titleKey: string }[]
  }
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

/**
 * The fullscreen mode of the desktop main window, where settings and the chat open beside the character. It is a
 * device choice, off by default, and the standalone settings window stays the default.
 */
export const MAIN_WINDOW_FULLSCREEN_FLAG: FeatureFlag = {
  key: 'main-window-fullscreen',
  titleKey: 'settings.pages.system.experimental.features.main_window_fullscreen.title',
  descriptionKey: 'settings.pages.system.experimental.features.main_window_fullscreen.description',
  defaultEnabled: false,
  availability: 'local',
  desktopOnly: true,
}

/** Only implemented experiments belong here. An empty catalog produces an empty settings page. */
export const featureFlags: readonly FeatureFlag[] = [CHARACTER_CARD_SYNC_FLAG, MAIN_WINDOW_FULLSCREEN_FLAG]

/** The experiments that an app offers. An app other than the desktop app leaves out the desktop-only ones. */
export function offeredFeatureFlags(desktop: boolean): readonly FeatureFlag[] {
  return featureFlags.filter(feature => desktop || !feature.desktopOnly)
}

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
