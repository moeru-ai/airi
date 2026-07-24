import type { CompanionModePreviewChannelEvent } from '../../shared/companion-mode-previews'

import { useBroadcastChannel } from '@vueuse/core'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'

import { companionModePreviewChannelName } from '../../shared/companion-mode-previews'
import { useCompanionModeStore } from '../stores/companion-mode'

export function useCompanionModePreviewSnapshot() {
  const companionModeStore = useCompanionModeStore()
  const activeOwnerInstanceId = ref<string | null>(null)
  const { close, data, post } = useBroadcastChannel<CompanionModePreviewChannelEvent, CompanionModePreviewChannelEvent>({
    name: companionModePreviewChannelName,
  })

  function requestCurrent() {
    post({ type: 'request-current' })
  }

  function requestCurrentWhenVisible() {
    if (document.visibilityState === 'visible')
      requestCurrent()
  }

  watch(data, (event) => {
    if (!event)
      return

    if (event.type === 'snapshot') {
      activeOwnerInstanceId.value = event.ownerInstanceId
      companionModeStore.replaceLogImages(event.images)
      return
    }

    if (event.type === 'owner-gone' && activeOwnerInstanceId.value === event.ownerInstanceId) {
      activeOwnerInstanceId.value = null
      companionModeStore.replaceLogImages({})
    }
  })

  onMounted(() => {
    activeOwnerInstanceId.value = null
    companionModeStore.replaceLogImages({})
    requestCurrent()
    window.addEventListener('focus', requestCurrent)
    document.addEventListener('visibilitychange', requestCurrentWhenVisible)
  })

  onBeforeUnmount(() => {
    window.removeEventListener('focus', requestCurrent)
    document.removeEventListener('visibilitychange', requestCurrentWhenVisible)
    activeOwnerInstanceId.value = null
    companionModeStore.replaceLogImages({})
    close()
  })

  return {
    activeOwnerInstanceId,
    requestCurrent,
  }
}
