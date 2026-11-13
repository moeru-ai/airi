import type { DevicePermission, DevicePermissionKind } from '../../stores/device-permissions'

/** The key of a page that sets up a feature of AIRI, not a system permission. */
export type DeviceSetupFeatureKey = 'voiceprint'

/**
 * The name that a page uses in `requires`. A permission page uses its kind, because the permission IDs differ between
 * the hosts. For example, the screen permission of the web has the ID `screen-share` and the kind `screen-recording`.
 */
export type DeviceSetupPageKey = DevicePermissionKind | DeviceSetupFeatureKey

export interface DeviceSetupFeature {
  key: DeviceSetupFeatureKey
  /**
   * The pages that must be done before this page. A permission page is done when the system allows it.
   * A page that the host does not have counts as done. For example, a host that needs no microphone permission
   * registers no microphone page.
   */
  requires: readonly DeviceSetupPageKey[]
  /** i18n key of the name in the steps and in the summary. */
  titleKey: string
  icon: string
  /** i18n key of the result in the summary when the page is done. */
  onKey: string
  /** i18n key of the result when the page is not done. The summary and the tooltip of Skip show it. */
  offKey: string
  /** True when the feature is set up, for example when a voiceprint is saved. */
  done: () => boolean
}

interface DeviceSetupPageBase {
  /** Unique in the list. A permission page uses the permission ID, and a feature page uses its key. */
  id: string
  requires: readonly DeviceSetupPageKey[]
}

export interface DeviceSetupPermissionPage extends DeviceSetupPageBase {
  type: 'permission'
  key: DevicePermissionKind
  permission: DevicePermission
}

export interface DeviceSetupFeaturePage extends DeviceSetupPageBase {
  type: 'feature'
  key: DeviceSetupFeatureKey
  feature: DeviceSetupFeature
}

/** A page of the device setup step, that is the `permissions` step of onboarding. */
export type DeviceSetupPage = DeviceSetupPermissionPage | DeviceSetupFeaturePage

/**
 * Puts the permission pages in host order, and each feature page after the last page that it requires.
 * Feature pages after the same page keep the order of `features`. A feature page without a required page of
 * this host goes after all other pages.
 */
export function orderDeviceSetupPages(permissions: readonly DevicePermission[], features: readonly DeviceSetupFeature[]): DeviceSetupPage[] {
  const pages: DeviceSetupPage[] = permissions.map(permission => ({
    type: 'permission',
    id: permission.id,
    key: permission.kind,
    requires: [],
    permission,
  }))

  features.forEach((feature, index) => {
    const later = feature.requires.find(key => features.slice(index + 1).some(other => other.key === key))
    if (later)
      throw new Error(`The ${feature.key} setup page requires the ${later} page, which comes later in the list`)

    const anchor = pages.findLastIndex(page => feature.requires.includes(page.key))
    let position = anchor < 0 ? pages.length : anchor + 1
    while (position < pages.length && pages[position].type === 'feature')
      position++
    pages.splice(position, 0, { type: 'feature', id: feature.key, key: feature.key, requires: feature.requires, feature })
  })

  return pages
}

/** The pages that `page` requires and that are not done, in list order. An empty list means that the page can be set up. */
export function unmetRequirementsOf(page: DeviceSetupPage, pages: readonly DeviceSetupPage[], isDone: (page: DeviceSetupPage) => boolean): DeviceSetupPage[] {
  return pages.filter(other => page.requires.includes(other.key) && !isDone(other))
}
