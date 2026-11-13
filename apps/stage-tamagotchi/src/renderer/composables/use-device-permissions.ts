import type { DevicePermission, DevicePermissionStatus, ScreenPreview } from '@proj-airi/stage-ui/stores/device-permissions'

import { electron } from '@proj-airi/electron-eventa'
import { useElectronScreenCapture } from '@proj-airi/electron-screen-capture/vue'
import { getElectronEventaContext, useElectronEventaInvoke } from '@proj-airi/electron-vueuse'
import { formatAccelerator } from '@proj-airi/stage-shared/global-shortcut'

import { createObjectUrlFromBytes } from '../utils/create-object-url-from-bytes'
import { usePushToTalkShortcutSettings, usePushToTalkTry } from './use-push-to-talk-shortcut'

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
  const { accelerator } = usePushToTalkShortcutSettings()
  const isTrusted = async () => await isTrustedAccessibilityClient([false])
  const tryShortcut = usePushToTalkTry(isTrusted)
  let screenCapture: ReturnType<typeof useElectronScreenCapture> | undefined
  /** The preview URLs of the last capture. The next capture revokes them, so a refreshing preview does not leak. */
  let previewUrls: string[] = []

  async function captureScreens(): Promise<ScreenPreview[]> {
    screenCapture ??= useElectronScreenCapture(getElectronEventaContext(), { types: ['screen'], thumbnailSize: { width: 960, height: 600 } })
    const sources = await screenCapture.getSources()
    const previews = sources
      .filter(source => source.thumbnail && source.thumbnail.length > 0)
      .map(source => ({ id: source.id, name: source.name, imageUrl: createObjectUrlFromBytes(source.thumbnail!, 'image/jpeg') }))
    for (const url of previewUrls)
      URL.revokeObjectURL(url)
    previewUrls = previews.map(preview => preview.imageUrl)
    return previews
  }

  const isMacOS = /Macintosh|Mac OS X/.test(navigator.userAgent)
  const isWindows = /Windows/.test(navigator.userAgent)

  const microphone: DevicePermission = {
    id: 'microphone',
    kind: 'microphone',
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
      kind: 'accessibility',
      titleKey: 'settings.dialogs.onboarding.permissions.accessibilityTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.accessibilityDescription',
      settingsLocationKey: 'settings.dialogs.onboarding.permissions.flow.accessibility.location',
      // Accessibility lets the Push to Talk shortcut work in other apps, so the step shows that shortcut.
      shortcutKeys: () => formatAccelerator(accelerator.value).replaceAll('Key', '').replaceAll('Digit', '').split('+'),
      tryShortcut,
      // macOS does not report a denial. An untrusted app looks the same before and after the prompt.
      check: async () => await isTrusted() ? 'granted' : 'not-determined',
      // The prompt adds AIRI to the Accessibility list and offers to open System Settings.
      request: async () => {
        await isTrustedAccessibilityClient([true])
      },
    },
    {
      id: 'screen-recording',
      kind: 'screen-recording',
      titleKey: 'settings.dialogs.onboarding.permissions.screenRecordingTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.screenRecordingDescription',
      settingsLocationKey: 'settings.dialogs.onboarding.permissions.flow.screen-recording.location',
      captureScreens,
      check: async () => toPermissionStatus(await getMediaAccessStatus(['screen'])),
      // macOS has no Screen Recording prompt for an app. The user turns it on in System Settings.
      request: async () => {
        await openPrivacySettings(['screen'])
      },
    },
  ]
}
