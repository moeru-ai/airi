import { createGlobalState, useLocalStorage } from '@vueuse/core'
import { clamp } from 'es-toolkit'
import { computed } from 'vue'

interface TimingSetting {
  /** The value of a new install. */
  default: number
  /** The slider range. A stored value outside it reads as the nearest end. */
  min: number
  max: number
}

/** Timing of the folded danmaku feed: the value of a new install and the slider range of each setting. */
export const danmakuFeedTiming = {
  /** Visible characters per second. */
  charactersPerSecond: { default: 6, min: 2, max: 20 },
  /** Seconds, so a message of a few characters stays long enough to notice. */
  minimumSeconds: { default: 3, min: 1, max: 30 },
} satisfies Record<string, TimingSetting>

/** A stored timing setting that always reads inside its slider range, even after a manual edit of the storage. */
function useTimingSetting(key: string, setting: TimingSetting) {
  const stored = useLocalStorage(key, setting.default)
  return computed({
    get: () => Number.isFinite(stored.value) ? clamp(stored.value, setting.min, setting.max) : setting.default,
    set: (value) => {
      stored.value = value
    },
  })
}

/**
 * Settings of the folded danmaku feed. The feed settings button in the danmaku
 * chat header changes them, and the danmaku chat window applies them. The
 * window shares one copy of them.
 */
export const useDanmakuFeedSettings = createGlobalState(() => ({
  /** On by default, because the feed is mostly read. */
  hideReadMessages: useLocalStorage('chat-window/danmaku/hide-read-messages', true),
  /** Every language counts characters the same way, so the reader sets the speed. */
  charactersPerSecond: useTimingSetting('chat-window/danmaku/characters-per-second', danmakuFeedTiming.charactersPerSecond),
  minimumSeconds: useTimingSetting('chat-window/danmaku/minimum-seconds', danmakuFeedTiming.minimumSeconds),
}))
