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

/** Cloud sync for imported Live2D and VRM models. A device choice, off by default, so no model file leaves the device without opt-in. */
export const DISPLAY_MODEL_SYNC_FLAG: FeatureFlag = {
  key: 'display-model-sync',
  titleKey: 'settings.pages.system.experimental.features.display_model_sync.title',
  descriptionKey: 'settings.pages.system.experimental.features.display_model_sync.description',
  defaultEnabled: false,
  availability: 'local',
}

/**
 * The fullscreen mode of the desktop app, where settings and the chat open beside the character. It is a device
 * choice, off by default, and the standalone settings window stays the default.
 *
 * - `single-window`: the main window grows over the screen and shows the mode.
 * - `multi-window`: a window of its own shows the mode, and the main window stays on the desktop as it is.
 */
export const FULLSCREEN_WORKSPACE_FLAG = {
  key: 'fullscreen-workspace',
  titleKey: 'settings.pages.system.experimental.features.fullscreen_workspace.title',
  descriptionKey: 'settings.pages.system.experimental.features.fullscreen_workspace.description',
  defaultEnabled: false,
  availability: 'local',
  desktopOnly: true,
  variants: {
    titleKey: 'settings.pages.system.experimental.features.fullscreen_workspace.window_mode.title',
    descriptionKey: 'settings.pages.system.experimental.features.fullscreen_workspace.window_mode.description',
    options: [
      { value: 'single-window', titleKey: 'settings.pages.system.experimental.features.fullscreen_workspace.window_mode.single_window' },
      { value: 'multi-window', titleKey: 'settings.pages.system.experimental.features.fullscreen_workspace.window_mode.multi_window' },
    ],
  },
} as const satisfies FeatureFlag

/** Only implemented experiments belong here. An empty catalog produces an empty settings page. */
export const featureFlags: readonly FeatureFlag[] = [CHARACTER_CARD_SYNC_FLAG, DISPLAY_MODEL_SYNC_FLAG, FULLSCREEN_WORKSPACE_FLAG]

/** The variant of a feature: the saved one while the feature still offers it, otherwise the first one. */
export function resolveFeatureVariant(feature: FeatureFlag | undefined, saved: string | undefined): string | undefined {
  const options = feature?.variants?.options
  if (!options?.length)
    return undefined
  return options.some(option => option.value === saved) ? saved : options[0].value
}

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
