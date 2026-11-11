import { useI18n } from 'vue-i18n'
import { toast } from 'vue-sonner'

import { useRealtimeCallStore } from '../../../../stores/realtime-call'
import { useSettingsAudioDevice } from '../../../../stores/settings/audio-device'
import { useVoiceCallStore } from '../../../../stores/voice-call'

/**
 * Starts a voice call from a chat control and explains a failure with a toast.
 * `configure` opens a Hearing settings route in the host's own router or window.
 * `canStart` reports whether the composer is free, for example no recording is open. See `VoiceCallStartOptions`.
 */
export function useStartVoiceCall(
  configure: (route: '/settings/modules/hearing' | '/settings/modules/hearing/transcriber') => void,
  canStart?: () => boolean,
) {
  const { t } = useI18n()
  const call = useVoiceCallStore()
  const devices = useSettingsAudioDevice()
  const realtime = useRealtimeCallStore()

  return async function startVoiceCall() {
    const failure = await call.start({ canStart })
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
    else if (failure === 'busy') {
      toast(t('stage.chat.call.failed'), { description: t('stage.chat.call.busy') })
    }
    else if (failure === 'no-host') {
      toast(t('stage.chat.call.failed'), { description: t('stage.chat.call.no-host') })
    }
    else if (failure === 'host-rejected') {
      toast(t('stage.chat.call.failed'), { description: t('stage.chat.call.host-rejected') })
    }
    else if (failure === 'host-failed') {
      toast.error(t('stage.chat.call.failed'), { description: realtime.error ?? t('stage.chat.call.host-failed') })
    }
    else if (failure === 'denied') {
      toast.error(t('stage.chat.call.failed'), { description: devices.error ?? t('stage.chat.call.microphone-denied') })
    }
  }
}
