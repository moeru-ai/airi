import type { DevicePermission, DevicePermissionStatus } from '@proj-airi/stage-ui/stores/device-permissions'

import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { useSettingsAudioDevice } from '@proj-airi/stage-ui/stores/settings'
import { useLocalStorage } from '@vueuse/core'
import { AndroidSettings, IOSSettings, NativeSettings } from 'capacitor-native-settings'

import { MicrophonePermission } from '../modules/microphone-permission'

/**
 * Returns the notification and microphone permissions of Pocket.
 *
 * Capacitor reports a denied notification permission. The microphone has no reliable denial state on
 * iOS, so the first request records that it asked. A later request opens the app settings instead,
 * because the system does not ask again.
 */
export function useDevicePermissions(): DevicePermission[] {
  const audioDeviceStore = useSettingsAudioDevice()
  const isNativePlatform = Capacitor.isNativePlatform()
  const isAndroid = Capacitor.getPlatform() === 'android'
  const microphoneRequested = useLocalStorage('permissions/microphone/requested', false)

  async function microphoneGranted() {
    // The Android plugin reads the platform state without a prompt.
    if (isAndroid)
      return (await MicrophonePermission.checkPermission()).granted

    const permission = await navigator.permissions?.query({ name: 'microphone' }).catch(() => undefined)
    return permission ? permission.state === 'granted' : audioDeviceStore.permissionGranted
  }

  return [
    {
      id: 'notifications',
      titleKey: 'settings.dialogs.onboarding.permissions.notificationsTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.notificationsDescription',
      check: async () => {
        const { display } = await LocalNotifications.checkPermissions()
        if (display === 'granted')
          return 'granted'
        return display === 'denied' ? 'denied' : 'not-determined'
      },
      request: async () => {
        const { display } = await LocalNotifications.checkPermissions()
        if (display === 'denied') {
          if (isNativePlatform)
            await NativeSettings.open({ optionAndroid: AndroidSettings.AppNotification, optionIOS: IOSSettings.AppNotification })
          return
        }
        if (display !== 'granted')
          await LocalNotifications.requestPermissions()
      },
    },
    {
      id: 'microphone',
      titleKey: 'settings.dialogs.onboarding.permissions.microphoneTitle',
      descriptionKey: 'settings.dialogs.onboarding.permissions.microphoneDescription',
      check: async (): Promise<DevicePermissionStatus> => {
        if (await microphoneGranted())
          return 'granted'
        return microphoneRequested.value && isNativePlatform ? 'denied' : 'not-determined'
      },
      request: async () => {
        if (await microphoneGranted())
          return
        if (microphoneRequested.value && isNativePlatform) {
          await NativeSettings.open({ optionAndroid: AndroidSettings.ApplicationDetails, optionIOS: IOSSettings.App })
          return
        }
        // Record the request before it starts, so a later click opens the settings, also after a denial.
        microphoneRequested.value = true
        await audioDeviceStore.askPermission()
      },
    },
  ]
}
