import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export type ChatSendMode = 'enter' | 'ctrl-enter' | 'double-enter'

export const useSettingsChat = defineStore('settings-chat', () => {
  const sendMode = useLocalStorageManualReset<ChatSendMode>('settings/chat/send-mode', 'enter')
  const streamIdleTimeoutMs = useLocalStorageManualReset<number>('settings/chat/stream-idle-timeout-ms', 30000)

  function resetState() {
    sendMode.reset()
    streamIdleTimeoutMs.reset()
  }

  return {
    sendMode,
    streamIdleTimeoutMs,
    resetState,
  }
})
