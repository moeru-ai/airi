import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * - `granted`: the system allows the access.
 * - `not-determined`: the system has not asked yet. `request` shows the system prompt.
 * - `denied`: the system does not ask again. `request` opens the system settings.
 */
export type DevicePermissionStatus = 'granted' | 'denied' | 'not-determined'

/** One operating system permission that the host can check and request. */
export interface DevicePermission {
  id: string
  /** i18n key of the title. */
  titleKey: string
  /** i18n key of the reason that AIRI needs the permission. */
  descriptionKey: string
  check: () => Promise<DevicePermissionStatus>
  /** Shows the system prompt, or opens the system settings when the system does not ask again. */
  request: () => Promise<void>
}

/**
 * The permissions of this device. Each host registers its list at startup, in each window that
 * decides or shows onboarding, or shows the permissions settings. A host without system permissions,
 * for example the web, registers nothing, and the onboarding permissions step does not apply.
 */
export const useDevicePermissionsStore = defineStore('device-permissions', () => {
  const permissions = shallowRef<readonly DevicePermission[]>([])

  function register(list: readonly DevicePermission[]) {
    permissions.value = list
  }

  return { permissions, register }
})
