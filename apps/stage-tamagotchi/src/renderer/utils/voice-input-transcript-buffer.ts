interface VoiceInputTranscriptBufferOptions {
  flushDelayMs: number
  maxBufferedTextLength?: number
  flush: (text: string) => Promise<void> | void
}

const DEFAULT_MAX_BUFFERED_TEXT_LENGTH = 80
const CJK_BOUNDARY_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u
const CJK_START_RE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * Joins two ASR fragments without adding visible spaces inside CJK text.
 */
function joinTranscriptFragments(previous: string, next: string) {
  if (!previous)
    return next

  if (CJK_BOUNDARY_RE.test(previous) && CJK_START_RE.test(next))
    return `${previous}${next}`

  return `${previous} ${next}`
}

/**
 * Creates a short-lived transcript buffer for grouping nearby ASR fragments.
 *
 * Use when:
 * - Record-then-transcribe providers return one text result per VAD segment.
 * - Natural pauses should not split one spoken thought into many chat turns.
 *
 * Expects:
 * - `flushDelayMs` is long enough to cover a normal thinking pause.
 *
 * Returns:
 * - Push/dispose actions that serialize flushes through the provided callback.
 */
export function createVoiceInputTranscriptBuffer(options: VoiceInputTranscriptBufferOptions) {
  let pendingText = ''
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushChain = Promise.resolve()
  const maxBufferedTextLength = options.maxBufferedTextLength ?? DEFAULT_MAX_BUFFERED_TEXT_LENGTH

  /**
   * Clears the pending delayed flush timer.
   */
  function clearFlushTimer() {
    if (!flushTimer)
      return

    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  /**
   * Sends buffered text through the configured flush callback.
   */
  function flushNow() {
    clearFlushTimer()

    const text = pendingText.trim()
    pendingText = ''
    if (!text)
      return flushChain

    flushChain = flushChain.then(() => options.flush(text))
    return flushChain
  }

  /**
   * Schedules a delayed flush so nearby speech fragments can be merged.
   */
  function scheduleFlush() {
    clearFlushTimer()
    flushTimer = setTimeout(() => {
      void flushNow()
    }, options.flushDelayMs)
  }

  /**
   * Adds a transcription fragment to the pending spoken turn.
   */
  function push(text: string) {
    const trimmed = text.trim()
    if (!trimmed)
      return

    pendingText = joinTranscriptFragments(pendingText, trimmed)

    if (pendingText.length >= maxBufferedTextLength) {
      void flushNow()
      return
    }

    scheduleFlush()
  }

  /**
   * Flushes pending text and stops future delayed sends.
   */
  async function dispose() {
    await flushNow()
  }

  /**
   * Discards pending text without sending it to chat.
   */
  function clear() {
    clearFlushTimer()
    pendingText = ''
  }

  return {
    push,
    flushNow,
    clear,
    dispose,
  }
}
