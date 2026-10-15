import { describe, expect, it, vi } from 'vitest'
import { effectScope, reactive } from 'vue'

import { holdSpeaking } from './speaking-holds'
import { useUtteranceAudio } from './use-utterance-audio'

const speaking = reactive({ nowSpeaking: false })

vi.mock('@proj-airi/stage-ui/stores/audio', () => ({ useSpeakingStore: () => speaking }))
vi.mock('@proj-airi/stage-ui/stores/voice', () => ({ useVoiceStore: () => ({ controller: { onInput: () => () => {} } }) }))

function setup() {
  const scope = effectScope(true)
  const audio = scope.run(() => useUtteranceAudio())!
  audio.utterances.set('input-1', { samples: new Float32Array(16000), sampleRate: 16000 })
  return { audio, dispose: () => scope.stop() }
}

describe('useUtteranceAudio', () => {
  // Codex review on PR #30: without echo cancellation, the host took the played utterance as a new turn.
  it('marks playback as speech until it stops', () => {
    const { audio, dispose } = setup()

    expect(audio.play('input-1')).toBe(true)
    expect(speaking.nowSpeaking).toBe(true)

    // A second playback replaces the first and keeps the flag.
    audio.play('input-1')
    expect(speaking.nowSpeaking).toBe(true)

    audio.stop()
    expect(speaking.nowSpeaking).toBe(false)
    dispose()
  })

  // Codex review on PR #30: a reply that ended during a played turn cleared the flag that the turn still needed.
  it('keeps the flag until every playback of the page ends', () => {
    const { audio, dispose } = setup()
    const releaseReply = holdSpeaking()

    audio.play('input-1')
    releaseReply()
    expect(speaking.nowSpeaking).toBe(true)

    audio.stop()
    expect(speaking.nowSpeaking).toBe(false)
    dispose()
  })
})
