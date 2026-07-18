import type { CompanionModePreviewChannelEvent } from '../../shared/companion-mode-previews'

import { useBroadcastChannel } from '@vueuse/core'
import { storeToRefs } from 'pinia'
import { onBeforeUnmount, watch } from 'vue'

import { companionModePreviewChannelName } from '../../shared/companion-mode-previews'
import {
  COMPANION_MODE_MAX_LOG_ENTRIES,
  useCompanionModeStore,
} from '../stores/companion-mode'

export function useCompanionModePreviewOwner() {
  const companionModeStore = useCompanionModeStore()
  const { logImages } = storeToRefs(companionModeStore)
  const ownerInstanceId = `tamagotchi-main-stage:${Math.random().toString(36).slice(2, 10)}`
  const { close, data, post } = useBroadcastChannel<CompanionModePreviewChannelEvent, CompanionModePreviewChannelEvent>({
    name: companionModePreviewChannelName,
  })

  function postEvent(event: CompanionModePreviewChannelEvent) {
    try {
      post(event)
    }
    catch (error) {
      console.warn('[Companion Mode] Failed to share capture previews:', error)
    }
  }

  function publishSnapshot() {
    postEvent({
      type: 'snapshot',
      ownerInstanceId,
      images: Object.fromEntries(
        Object.entries(logImages.value).slice(-COMPANION_MODE_MAX_LOG_ENTRIES),
      ),
    })
  }

  watch(logImages, publishSnapshot, { immediate: true })
  watch(data, (event) => {
    if (event?.type === 'request-current')
      publishSnapshot()
  })

  onBeforeUnmount(() => {
    postEvent({ type: 'owner-gone', ownerInstanceId })
    close()
  })

  return {
    ownerInstanceId,
    publishSnapshot,
  }
}
