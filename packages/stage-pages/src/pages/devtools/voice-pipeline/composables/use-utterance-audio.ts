import type { Position } from '@proj-airi/pipelines-audio'

import { toWav } from '@proj-airi/audio/encoding'
import { useVoiceStore } from '@proj-airi/stage-ui/stores/voice'
import { onScopeDispose, shallowReactive, shallowRef } from 'vue'

import { holdSpeaking } from './speaking-holds'

/** The IO tracer keeps 50 turns, so older utterances have no span to click. */
const MAX_UTTERANCES = 50

export interface UtteranceAudio {
  readonly samples: Float32Array<ArrayBuffer>
  readonly sampleRate: number
}

function concat(parts: readonly Float32Array[]) {
  const output = new Float32Array(parts.reduce((total, part) => total + part.length, 0))
  let offset = 0
  for (const part of parts) {
    output.set(part, offset)
    offset += part.length
  }
  return output
}

/**
 * Keeps the audio of each speech input while this scope runs, by input ID, so a traced turn can play its utterance.
 *
 * A copy of the input audio is read from the capture start while the input captures, so it is the audio that speech
 * recognition receives. The copy stops when the capture ends, so it never keeps the microphone open.
 * Playback counts as speech of the character, as reply audio does, so the host does not take it as a new turn
 * without echo cancellation.
 * Scope disposal stops the copies and the playback.
 */
export function useUtteranceAudio() {
  const voice = useVoiceStore()
  const utterances = shallowReactive(new Map<string, UtteranceAudio>())
  const playing = shallowRef<HTMLAudioElement>()
  const copies = new Set<AbortController>()

  async function copy(inputId: string, from: Position, signal: AbortSignal) {
    const audio = voice.controller.audio
    if (!audio)
      return
    const parts: Float32Array[] = []
    let sampleRate = 0
    try {
      for await (const block of audio.subscribe({ from, signal })) {
        sampleRate = block.sampleRate
        parts.push(block.channels[0]!)
      }
    }
    catch {
      // The source failed or lost its history. The input keeps the audio read before that, if any.
    }
    if (!parts.length)
      return

    utterances.set(inputId, { samples: concat(parts), sampleRate })
    for (const oldest of utterances.keys()) {
      if (utterances.size <= MAX_UTTERANCES)
        break
      utterances.delete(oldest)
    }
  }

  const stopObserving = voice.controller.onInput((attempt) => {
    let running: AbortController | undefined
    const stopState = attempt.subscribe((state) => {
      if (state.phase === 'capturing' && !running) {
        running = new AbortController()
        copies.add(running)
        void copy(attempt.id, state.from, running.signal)
        return
      }
      if (state.phase === 'finalizing' || state.phase === 'settled') {
        running?.abort()
        if (running)
          copies.delete(running)
      }
    })
    void attempt.done.then(() => stopState())
  })

  /** Ends the current playback. The pause event comes later, so the release runs here, before a next playback marks speech. */
  let releasePlaying: (() => void) | undefined

  function stop() {
    playing.value?.pause()
    releasePlaying?.()
  }

  /** Plays the utterance of an input. Returns false when the input has no audio, for example after a reload. */
  function play(inputId: string) {
    const utterance = utterances.get(inputId)
    if (!utterance)
      return false

    stop()
    const url = URL.createObjectURL(new Blob([toWav(utterance.samples.buffer, utterance.sampleRate)], { type: 'audio/wav' }))
    const element = new Audio(url)
    const releaseSpeaking = holdSpeaking()
    let released = false
    const release = () => {
      if (released)
        return
      released = true
      URL.revokeObjectURL(url)
      releaseSpeaking()
      if (playing.value === element)
        playing.value = undefined
      if (releasePlaying === release)
        releasePlaying = undefined
    }
    element.addEventListener('ended', release, { once: true })
    element.addEventListener('pause', release, { once: true })
    playing.value = element
    releasePlaying = release
    void element.play().catch(release)
    return true
  }

  onScopeDispose(() => {
    stopObserving()
    copies.forEach(copy => copy.abort())
    stop()
  })

  return { utterances, playing, play, stop }
}
