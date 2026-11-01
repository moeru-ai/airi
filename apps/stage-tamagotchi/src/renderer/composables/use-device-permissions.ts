import type { DevicePermission, DevicePermissionStatus } from '@proj-airi/stage-ui/stores/device-permissions'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronEventaInvoke } from '@proj-airi/electron-vueuse'

/** Maps an Electron media access status. `restricted` comes from a policy that the user cannot change in AIRI. */
function toPermissionStatus(status: string): DevicePermissionStatus {
  if (status === 'granted')
    return 'granted'
  if (status === 'denied' || status === 'restricted')
    return 'denied'
  return 'not-determined'
}

/**
 * Returns the operating system permissions of this desktop.
 *
 * - macOS: microphone, Accessibility for the Push to Talk shortcut, and Screen Recording.
 * - Windows: microphone. Windows has no Accessibility or Screen Recording consent.
 * - Linux: none. Chromium uses the microphone without a system consent.
 *
 * Registration must finish before the startup check, so the platform comes from the user agent,
 * which is available at once. An invoke to main returns later.
 */
export function useDevicePermissions(): DevicePermission[] {
  const getMediaAccessStatus = useElectronEventaInvoke(electron.systemPreferences.getMediaAccessStatus)
  const askForMediaAccess = useElectronEventaInvoke(electron.systemPreferences.askForMediaAccess)
  const isTrustedAccessibilityClient = useElectronEventaInvoke(electron.systemPreferences.isTrustedAccessibilityClient)
  const openPrivacySettings = useElectronEventaInvoke(electron.systemPreferences.openPrivacySettings)

  const isMacOS = /Macintosh|Mac OS X/.test(navigator.userAgent)
  const isWindows = /Windows/.test(navigator.userAgent)

  const microphone: DevicePermission = {
    id: 'microphone',
    titleKey: 'settings.dialogs.onboarding.permissions.microphoneTitle',
    descriptionKey: 'settings.dialogs.onboarding.permissions.microphoneDescription',
    check: async () => toPermissionStatus(await getMediaAccessStatus(['microphone'])),
    request: async () => {
      // Only macOS shows a microphone prompt. Windows changes the consent in its settings.
      if (isMacOS && toPermissionStatus(await getMediaAccessStatus(['microphone'])) === 'not-determined')
        await askForMediaAccess(['microphone'])
      else
        await openPrivacySettings(['microphone'])
    },
  }

  if (isWindows)
    return [microphone]
  if (!isMacOS)
    return []

  return [
    microphone,
    {
      id: 'accessibility',
      titleKey: 'settings.dialogs.onboarding.permissions.accessibilityTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.accessibilityDescription',
      // macOS does not report a denial. An untrusted app looks the same before and after the prompt.
      check: async () => await isTrustedAccessibilityClient([false]) ? 'granted' : 'not-determined',
      // The prompt adds AIRI to the Accessibility list and offers to open System Settings.
      request: async () => {
        await isTrustedAccessibilityClient([true])
      },
    },
    {
      id: 'screen-recording',
      titleKey: 'settings.dialogs.onboarding.permissions.screenRecordingTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.screenRecordingDescription',
      check: async () => toPermissionStatus(await getMediaAccessStatus(['screen'])),
      // macOS has no Screen Recording prompt for an app. The user turns it on in System Settings.
      request: async () => {
        await openPrivacySettings(['screen'])
      },
    },
  ]
}
