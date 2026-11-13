import type { systemPreferences as electronSystemPreferences } from 'electron'

import { defineInvokeEventa } from '@moeru/eventa'

type MediaAccessStatusRequest = ['microphone' | 'camera' | 'screen']
type AskForMediaAccessRequest = ['microphone' | 'camera']
/** `true` shows the macOS prompt that opens the Accessibility pane. `false` only reads the status. */
type IsTrustedAccessibilityClientRequest = [prompt: boolean]
/** The privacy pane to open. Main maps it to the settings URL of the platform, so the renderer sends no URL. */
type OpenPrivacySettingsRequest = ['microphone' | 'accessibility' | 'screen']

const getMediaAccessStatus = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.getMediaAccessStatus>, MediaAccessStatusRequest>('eventa:invoke:electron:system-preferences:get-media-access-status')
const askForMediaAccess = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.askForMediaAccess>, AskForMediaAccessRequest>('eventa:invoke:electron:system-preferences:ask-for-media-access')
const isTrustedAccessibilityClient = defineInvokeEventa<boolean, IsTrustedAccessibilityClientRequest>('eventa:invoke:electron:system-preferences:is-trusted-accessibility-client')
const openPrivacySettings = defineInvokeEventa<void, OpenPrivacySettingsRequest>('eventa:invoke:electron:system-preferences:open-privacy-settings')

export const systemPreferences = {
  getMediaAccessStatus,
  askForMediaAccess,
  isTrustedAccessibilityClient,
  openPrivacySettings,
}
