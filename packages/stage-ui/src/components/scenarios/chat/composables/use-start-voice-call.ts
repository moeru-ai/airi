import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useVoiceCallStore } from '../../../../stores/voice-call'

/**
 * Starts a voice call from a chat control and explains a failure with a toast.
 * `configure` opens a Hearing settings route in the host's own router or window.
 */
export function useStartVoiceCall(configure: (route: '/settings/modules/hearing' | '/settings/modules/hearing/transcriber') => void) {
  const { t } = useI18n()
  const call = useVoiceCallStore()
  const devices = useSettingsAudioDevice()

  return async function startVoiceCall() {
    const failure = await call.start()
    if (failure === 'unconfigured') {
      toast(t('stage.chat.voice-composer.configure-title'), {
        description: t('stage.chat.call.configure-description'),
        action: { label: t('stage.chat.voice-composer.configure-action'), onClick: () => configure('/settings/modules/hearing/transcriber') },
      })
    }
    else if (failure === 'microphone-off') {
      toast(t('stage.chat.call.failed'), {
        description: t('stage.chat.call.microphone-off'),
        action: { label: t('stage.chat.voice-composer.configure-action'), onClick: () => configure('/settings/modules/hearing') },
      })
    }
    else if (failure === 'denied') {
      toast.error(t('stage.chat.call.failed'), { description: devices.error ?? t('stage.chat.call.microphone-denied') })
    }
  }
}
