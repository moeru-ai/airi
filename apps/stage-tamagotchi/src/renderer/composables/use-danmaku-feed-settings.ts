import { useLocalStorage } from '@vueuse/core'

/** Reading speed of a new install, in visible characters per second. */
export const DEFAULT_CHARACTERS_PER_SECOND = 6
/** Minimum showing time of a new install, in seconds. */
export const DEFAULT_MINIMUM_SECONDS = 3

/**
 * Settings of the folded danmaku feed. The feed settings button in the danmaku
 * chat header changes them, and the danmaku chat window applies them.
 */
export function useDanmakuFeedSettings() {
  return {
    /** On by default, because the feed is mostly read. */
    hideReadMessages: useLocalStorage('chat-window/danmaku/hide-read-messages', true),
    /** Visible characters per second. Every language counts characters the same way, so the reader sets the speed. */
    charactersPerSecond: useLocalStorage('chat-window/danmaku/characters-per-second', DEFAULT_CHARACTERS_PER_SECOND),
    /** Seconds, so a message of a few characters stays long enough to notice. */
    minimumSeconds: useLocalStorage('chat-window/danmaku/minimum-seconds', DEFAULT_MINIMUM_SECONDS),
  }
}
