import type { createContext } from '@moeru/eventa/adapters/electron/main'
import type { BrowserWindow } from 'electron'

import { defineInvokeHandler } from '@moeru/eventa'
import { shell, systemPreferences } from 'electron'
import { isLinux, isMacOS, isWindows } from 'std-env'

import { electron } from '../../../shared/eventa'

/**
 * The settings URL of each privacy pane. Windows has no Accessibility or Screen Recording consent,
 * so it has only the microphone pane. Linux has no privacy panes.
 */
const privacySettingsUrls = {
  darwin: {
    microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
    accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
    screen: 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  },
  win32: {
    microphone: 'ms-settings:privacy-microphone',
  },
} as const

export function createSystemPreferencesService(params: { context: ReturnType<typeof createContext>['context'], window: BrowserWindow }) {
  defineInvokeHandler(params.context, electron.systemPreferences.getMediaAccessStatus, (type) => {
    if (isLinux || !type) {
      return 'not-determined'
    }

    return systemPreferences.getMediaAccessStatus(type[0])
  })
  defineInvokeHandler(params.context, electron.systemPreferences.askForMediaAccess, (type) => {
    if (isLinux || !type) {
      return Promise.resolve(false)
    }

    return systemPreferences.askForMediaAccess(type[0])
  })
  // Only macOS asks for Accessibility. Other platforms let the global shortcut hook work without it.
  defineInvokeHandler(params.context, electron.systemPreferences.isTrustedAccessibilityClient, (request) => {
    if (!isMacOS)
      return true

    return systemPreferences.isTrustedAccessibilityClient(request?.[0] ?? false)
  })
  defineInvokeHandler(params.context, electron.systemPreferences.openPrivacySettings, async (request) => {
    const pane = request?.[0]
    let url: string | undefined
    if (isMacOS && pane)
      url = privacySettingsUrls.darwin[pane]
    else if (isWindows && pane === 'microphone')
      url = privacySettingsUrls.win32.microphone
    if (url)
      await shell.openExternal(url)
  })
}
