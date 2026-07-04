import { defineInvokeEventa } from '@moeru/eventa'

const getMediaAccessStatus = defineInvokeEventa<string, ['microphone' | 'camera' | 'screen']>(
  'eventa:invoke:electron:system-preferences:get-media-access-status',
)
const askForMediaAccess = defineInvokeEventa<string, ['microphone' | 'camera']>(
  'eventa:invoke:electron:system-preferences:ask-for-media-access',
)

export const systemPreferences = {
  getMediaAccessStatus,
  askForMediaAccess,
}
