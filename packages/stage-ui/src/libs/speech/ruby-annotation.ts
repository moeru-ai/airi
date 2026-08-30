/**
 * Streaming-safe projection of ruby-annotated assistant text into separate
 * display and speech strings.
 *
 * Ruby syntax (Aozora/pixiv-style, explicit-base form):
 *
 *     ｜<base>《<reading>》
 *
 * e.g. `｜約束《やくそく》は` → display `約束は`, speech `やくそくは`.
 *
 * `displayText` preserves the base (e.g. kanji) for the chat surface;
 * `speechText` substitutes the reading so TTS pronounces it correctly. The
 * annotation markers themselves are never displayed nor pronounced.
 *
 * The projector is stateful so a single annotation may be split across
 * arbitrary streaming chunk boundaries (e.g. `｜約` + `束《やく` + `そく》は`):
 * partial annotations are buffered and only committed once the closing `》`
 * arrives. `flush()` emits any unterminated buffer verbatim — graceful
 * degradation, so malformed markup is shown literally rather than dropped.
 *
 * Text without annotations passes through unchanged (`displayText` ===
 * `speechText`), so this is a no-op for the common non-annotated case.
 */

/** ｜ U+FF5C fullwidth vertical line — marks the start of the base run. */
const RUBY_BASE_MARK = '｜'
/** 《 U+300A — opens the reading. */
const RUBY_OPEN = '《'
/** 》 U+300B — closes the reading. */
const RUBY_CLOSE = '》'

export interface RubyProjection {
  /** Text to render in the chat surface (base preserved, markers stripped). */
  displayText: string
  /** Text to feed the TTS pipeline (reading substituted, markers stripped). */
  speechText: string
}

type State = 'normal' | 'base' | 'reading'

export interface RubyProjector {
  /**
   * Feed the next streaming chunk. Returns only the portion that can be
   * committed now — text outside annotations, plus any annotation whose
   * closing `》` arrived in this chunk. A partial annotation is withheld
   * (empty delta) until it completes in a later chunk.
   */
  push: (chunk: string) => RubyProjection
  /**
   * Emit any unterminated annotation buffer verbatim and reset. Call once the
   * stream ends so no buffered text is lost.
   */
  flush: () => RubyProjection
}

export function createRubyProjector(): RubyProjector {
  let state: State = 'normal'
  let base = ''
  let reading = ''

  function push(chunk: string): RubyProjection {
    let display = ''
    let speech = ''

    for (const ch of chunk) {
      switch (state) {
        case 'normal':
          if (ch === RUBY_BASE_MARK) {
            state = 'base'
            base = ''
          }
          else {
            display += ch
            speech += ch
          }
          break

        case 'base':
          if (ch === RUBY_OPEN) {
            state = 'reading'
            reading = ''
          }
          else if (ch === RUBY_BASE_MARK) {
            // A new base mark while still buffering the previous one: the
            // previous run was malformed. Emit it literally and restart.
            display += RUBY_BASE_MARK + base
            speech += RUBY_BASE_MARK + base
            base = ''
          }
          else {
            base += ch
          }
          break

        case 'reading':
          if (ch === RUBY_CLOSE) {
            display += base
            speech += reading
            base = ''
            reading = ''
            state = 'normal'
          }
          else {
            reading += ch
          }
          break
      }
    }

    return { displayText: display, speechText: speech }
  }

  function flush(): RubyProjection {
    let leftover = ''
    if (state === 'base')
      leftover = RUBY_BASE_MARK + base
    else if (state === 'reading')
      leftover = RUBY_BASE_MARK + base + RUBY_OPEN + reading

    state = 'normal'
    base = ''
    reading = ''
    return { displayText: leftover, speechText: leftover }
  }

  return { push, flush }
}

/** Convenience: project a complete (non-streaming) string in one call. */
export function projectRuby(text: string): RubyProjection {
  const projector = createRubyProjector()
  const body = projector.push(text)
  const tail = projector.flush()
  return {
    displayText: body.displayText + tail.displayText,
    speechText: body.speechText + tail.speechText,
  }
}
