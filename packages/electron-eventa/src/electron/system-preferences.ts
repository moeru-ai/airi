import type { systemPreferences as electronSystemPreferences } from 'electron'

import { defineInvokeEventa } from '@moeru/eventa'

type AskForMediaAccessRequest = ['camera' | 'microphone']
type MediaAccessStatusRequest = ['camera' | 'microphone' | 'screen']

const getMediaAccessStatus = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.getMediaAccessStatus>, MediaAccessStatusRequest>('eventa:invoke:electron:system-preferences:get-media-access-status')
const askForMediaAccess = defineInvokeEventa<ReturnType<typeof electronSystemPreferences.askForMediaAccess>, AskForMediaAccessRequest>('eventa:invoke:electron:system-preferences:ask-for-media-access')

export const systemPreferences = {
  askForMediaAccess,
  getMediaAccessStatus,
}
