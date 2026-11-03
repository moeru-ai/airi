import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/**
 * - `granted`: the system allows the access.
 * - `not-determined`: the system has not asked yet. `request` shows the system prompt.
 * - `denied`: the system does not ask again. `request` opens the system settings.
 */
export type DevicePermissionStatus = 'granted' | 'denied' | 'not-determined'

/**
 * What a permission gives access to. The onboarding flow shows one page layout for each kind:
 * a microphone test, the Push to Talk keys, a screen preview, or a plain request.
 */
export type DevicePermissionKind = 'microphone' | 'accessibility' | 'screen-recording' | 'notifications'

/** A press of the shortcut that the global hook saw. It works while another app is in front. */
export interface ShortcutTryEvent {
  phase: 'down' | 'up'
}

/** A still picture of one screen. */
export interface ScreenPreview {
  id: string
  name: string
  /** A URL that an `<img>` can show, for example a data URL. */
  imageUrl: string
}

/** One operating system permission that the host can check and request. */
export interface DevicePermission {
  id: string
  kind: DevicePermissionKind
  /** i18n key of the title. */
  titleKey: string
  /** i18n key of the reason that AIRI needs the permission. */
  descriptionKey: string
  check: () => Promise<DevicePermissionStatus>
  /** Shows the system prompt, or opens the system settings when the system does not ask again. */
  request: () => Promise<void>
  /** i18n key of the place in the system settings where the user turns the permission on. */
  settingsLocationKey?: string
  /** The keys of the shortcut that the permission enables, for example `['Ctrl', 'Shift', 'Space']`. Only `accessibility` uses it. */
  shortcutKeys?: () => readonly string[]
  /**
   * Listens for presses of the shortcut in any app, through the global hook. Returns a function that stops listening.
   * Without the permission, the hook sees nothing. Call it again after the status changes. Only `accessibility` uses it.
   */
  tryShortcut?: (listener: (event: ShortcutTryEvent) => void) => () => void
  /** Captures a still picture of each screen. Call it only while the permission is granted. Only `screen-recording` uses it. */
  captureScreens?: () => Promise<readonly ScreenPreview[]>
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
