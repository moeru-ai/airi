import type { systemPreferences as electronSystemPreferences } from 'electron'

import { defineInvokeEventa } from '@moeru/eventa'

const getMediaAccessStatus = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.getMediaAccessStatus>, [Parameters<typeof electronSystemPreferences.getMediaAccessStatus>[0]]>('eventa:invoke:electron:system-preferences:get-media-access-status')
const askForMediaAccess = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.askForMediaAccess>, [Parameters<typeof electronSystemPreferences.askForMediaAccess>[0]]>('eventa:invoke:electron:system-preferences:ask-for-media-access')

export const systemPreferences = {
  getMediaAccessStatus,
  askForMediaAccess,
}
