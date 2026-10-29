import { useNow } from '@vueuse/core'
import { computed } from 'vue'

import { useVoiceCallStore } from '../../../../stores/voice-call'
import { formatClockDuration } from '../../../../utils/clock-duration'

/** The running call time as `m:ss`. It is `0:00` without a call. */
export function useCallDuration() {
  const call = useVoiceCallStore()
  const now = useNow({ interval: 1000 })
  return computed(() => formatClockDuration(call.startedAt ? (now.value.getTime() - call.startedAt) / 1000 : 0))
}
