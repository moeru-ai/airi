import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'

export type SendKey = 'enter' | 'shift-enter'

export const useSettingsChat = defineStore('settings-chat', () => {
  const streamIdleTimeoutMs = useLocalStorageManualReset<number>(
    'settings/chat/stream-idle-timeout-ms',
    60_000,
  )

  const maxToolSteps = useLocalStorageManualReset<number>(
    'settings/chat/max-tool-steps',
    10,
  )

  const sendKey = useLocalStorageManualReset<SendKey>(
    'settings/chat/send-key',
    'enter',
  )

  function resetState() {
    streamIdleTimeoutMs.reset()
    maxToolSteps.reset()
    sendKey.reset()
  }

  return {
    streamIdleTimeoutMs,
    maxToolSteps,
    sendKey,
    resetState,
  }
})
