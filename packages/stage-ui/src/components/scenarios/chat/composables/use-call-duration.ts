import { useNow } from '@vueuse/core'
import { computed } from 'vue'

import { useVoiceCallStore } from '../../../../stores/voice-call'

/** The running call time as `m:ss`. It is `0:00` without a call. */
export function useCallDuration() {
  const call = useVoiceCallStore()
  const now = useNow({ interval: 1000 })
  return computed(() => {
    if (!call.startedAt)
      return '0:00'
    const seconds = Math.max(0, Math.floor((now.value.getTime() - call.startedAt) / 1000))
    return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
  })
}
