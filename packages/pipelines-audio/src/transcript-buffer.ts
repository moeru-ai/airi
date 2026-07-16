/** Options for grouping nearby ASR fragments into one transcript. */
export interface TranscriptBufferOptions {
  /** Delay after the latest fragment before the buffer flushes. */
  flushDelayMs: number
  /**
   * Maximum buffered text length before an immediate flush.
   *
   * @default 80
   */
  maxBufferedTextLength?: number
  /** Receives serialized, normalized transcript text. */
  flush: (text: string) => Promise<void> | void
}

const DEFAULT_MAX_BUFFERED_TEXT_LENGTH = 80
const CJK_BOUNDARY_RE = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]$/u
const CJK_START_RE = /^[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u

/**
 * Normalizes the boundary between two ASR transcript fragments.
 *
 * Before:
 * - `"你好"`, `"世界"`
 * - `"hello"`, `"world"`
 *
 * After:
 * - `"你好世界"`
 * - `"hello world"`
 */
function joinTranscriptFragments(previous: string, next: string) {
  if (!previous)
    return next

  if (CJK_BOUNDARY_RE.test(previous) && CJK_START_RE.test(next))
    return `${previous}${next}`

  return `${previous} ${next}`
}

/**
 * Groups nearby ASR fragments into serialized transcript flushes.
 *
 * Use when:
 * - Record-then-transcribe providers emit one result per VAD segment.
 * - Natural pauses should remain part of one spoken turn.
 *
 * Expects:
 * - `flushDelayMs` covers the pause window that should remain in one turn.
 * - The flush callback may be asynchronous and must run in transcript order.
 *
 * Returns:
 * - Actions to push fragments, flush or discard pending text, and dispose the buffer.
 */
export function createTranscriptBuffer(options: TranscriptBufferOptions) {
  let pendingText = ''
  let flushTimer: ReturnType<typeof setTimeout> | undefined
  let flushChain = Promise.resolve()
  const maxBufferedTextLength = options.maxBufferedTextLength ?? DEFAULT_MAX_BUFFERED_TEXT_LENGTH

  /** Clears the pending delayed flush timer. */
  function clearFlushTimer() {
    if (!flushTimer)
      return

    clearTimeout(flushTimer)
    flushTimer = undefined
  }

  /** Sends the current transcript through the serialized flush chain. */
  function flushNow() {
    clearFlushTimer()

    const text = pendingText.trim()
    pendingText = ''
    if (!text)
      return flushChain

    const delivery = flushChain.then(() => options.flush(text))

    // Keep the failed delivery observable to its caller without poisoning later queued flushes.
    flushChain = delivery.catch(() => {})
    return delivery
  }

  /** Schedules a delayed flush after the configured pause window. */
  function scheduleFlush() {
    clearFlushTimer()
    flushTimer = setTimeout(() => {
      void flushNow()
    }, options.flushDelayMs)
  }

  /** Adds one normalized ASR fragment to the pending spoken turn. */
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

  /** Discards pending text without invoking the flush callback. */
  function clear() {
    clearFlushTimer()
    pendingText = ''
  }

  /** Flushes pending text and prevents its delayed timer from firing later. */
  async function dispose() {
    await flushNow()
  }

  return {
    push,
    flushNow,
    clear,
    dispose,
  }
}
