import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import { useHearingStore } from '../stores/modules/hearing'
import { useVoiceControlsStore } from '../stores/voice-controls'

/**
 * Reads the problem that stops hearing, for status surfaces such as the hearing capsule and the microphone button.
 *
 * Returns:
 * - The message of a microphone error, a voice host error, or missing hearing setup
 * - `undefined` when hearing works or is off
 */
export function useHearingIssue() {
  const { t } = useI18n()
  const { error, snapshot } = storeToRefs(useVoiceControlsStore())
  const { configured, enabled: hearingEnabled } = storeToRefs(useHearingStore())

  return computed(() => {
    if (!hearingEnabled.value)
      return undefined
    // Device failure prevents all input, so it takes precedence over provider feedback.
    if (snapshot.value.microphone?.error)
      return snapshot.value.microphone.error
    if (error.value)
      return error.value
    if (snapshot.value.microphone?.enabled && !configured.value)
      return t('stage.status.configure-hearing')
    return undefined
  })
}
