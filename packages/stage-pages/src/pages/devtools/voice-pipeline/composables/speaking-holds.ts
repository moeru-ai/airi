import { defineInvoke } from '@moeru/eventa'
import { getSpeechBusContext, speechOutputGetPlaybackState, speechOutputPlaybackStateChangedEvent } from '@proj-airi/stage-ui/services/speech/bus'
import { useSpeakingStore } from '@proj-airi/stage-ui/stores/audio'
import { onScopeDispose } from 'vue'

/**
 * Playbacks of this page that hold the speaking flag now.
 * The page is the only voice host of its window, so it owns the flag. The count lets playbacks overlap.
 */
let holds = 0

/**
 * Marks audio that this page plays as speech of the character until the returned function runs.
 *
 * Voice activity detection does not start an input while the character speaks, unless the microphone has echo
 * cancellation. So reply audio, a played turn, or a played clip does not become a new turn.
 * The flag stays set until every hold is released. A second call of the returned function does nothing.
 */
export function holdSpeaking(): () => void {
  const speaking = useSpeakingStore()
  holds += 1
  speaking.nowSpeaking = true
  let released = false
  return () => {
    if (released)
      return
    released = true
    holds -= 1
    if (holds === 0)
      speaking.nowSpeaking = false
  }
}

/**
 * Holds the speaking flag while one audio element plays. Bind `start` to its `play` event and `end` to its `pause`,
 * `ended`, and `emptied` events. Scope disposal releases the hold.
 */
export function useElementSpeakingHold() {
  let release: (() => void) | undefined

  function start() {
    release ??= holdSpeaking()
  }

  function end() {
    release?.()
    release = undefined
  }

  onScopeDispose(end)
  return { start, end }
}

/** While another window speaks, this page asks its output host for the state this often. */
const CHECK_MS = 2000
/** An output host that does not answer in this time is gone, for example with a closed window. */
const ANSWER_MS = 1000

/**
 * Holds the speaking flag while the output host of another window plays speech, for example a reply or read-aloud
 * in the main window. That audio comes out of the same speakers, so this page's listener must not take it as a turn.
 *
 * States come from the change events of that host. A request gets the first state, and while the hold lasts, a request
 * every `CHECK_MS` checks it. A host that closes during speech sends no final event, so a request without an answer
 * ends the hold. Scope disposal also releases it.
 * The page has no stage of its own. A stage in this window reports this page's own flag, so the hold would never end.
 */
export function useOtherWindowSpeakingHold() {
  const bus = getSpeechBusContext()
  const getPlaybackState = defineInvoke(bus, speechOutputGetPlaybackState)
  let release: (() => void) | undefined
  let check: ReturnType<typeof setInterval> | undefined
  /** Counts requests and change events, so that an older answer does not replace a newer state. */
  let latest = 0
  let disposed = false

  function follow(speaking: boolean) {
    if (speaking) {
      release ??= holdSpeaking()
      check ??= setInterval(ask, CHECK_MS)
      return
    }
    clearInterval(check)
    check = undefined
    release?.()
    release = undefined
  }

  function ask() {
    const request = ++latest
    void getPlaybackState(undefined, { signal: AbortSignal.timeout(ANSWER_MS) })
      .then(state => state.speaking, () => false)
      .then((speaking) => {
        if (request === latest && !disposed)
          follow(speaking)
      })
  }

  const stopChanges = bus.on(speechOutputPlaybackStateChangedEvent, ({ body }) => {
    if (!body)
      return
    latest += 1
    follow(body.speaking)
  })
  ask()

  onScopeDispose(() => {
    disposed = true
    stopChanges()
    follow(false)
  })
}
