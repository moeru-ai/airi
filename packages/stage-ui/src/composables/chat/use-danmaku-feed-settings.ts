import { createGlobalState, useLocalStorage } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { computed } from 'vue'

interface TimingSetting {
  default: number
  min: number
  max: number
}

export const danmakuFeedTiming = {
  charactersPerSecond: { default: 6, min: 2, max: 20 },
  minimumSeconds: { default: 3, min: 1, max: 30 },
} satisfies Record<string, TimingSetting>

function useTimingSetting(key: string, setting: TimingSetting) {
  const stored = useLocalStorage(key, setting.default)
  return computed({
    get: () => Number.isFinite(stored.value) ? clamp(stored.value, setting.min, setting.max) : setting.default,
    set: (value) => {
      stored.value = value
    },
  })
}

/** Shares desktop feed settings within this renderer. Both desktop hosts persist the same reading-speed and minimum-duration preferences. */
export const useDanmakuFeedSettings = createGlobalState(() => ({
  hideReadMessages: useLocalStorage('chat-window/danmaku/hide-read-messages', true),
  charactersPerSecond: useTimingSetting('chat-window/danmaku/characters-per-second', danmakuFeedTiming.charactersPerSecond),
  minimumSeconds: useTimingSetting('chat-window/danmaku/minimum-seconds', danmakuFeedTiming.minimumSeconds),
}))
