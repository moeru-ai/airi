import type { SpeechInputAttemptOutcome } from '@proj-airi/core-agent'

import { describe, expect, it, vi } from 'vitest'
import { reactive } from 'vue'

import { useClipReplay } from './use-clip-replay'

const devices = reactive({ input: { name: 'microphone' } as object, enabled: true })
const hearing = reactive({ inputMode: 'push-to-talk' })
/** The outcome of the next manual input. Without one, the input never settles. */
let nextOutcome: Promise<SpeechInputAttemptOutcome> = new Promise(() => {})
const voice = {
  controller: {
    onInput: () => () => {},
    replaceAudio: vi.fn(),
  },
  beginManual: () => ({
    done: nextOutcome,
    end: () => new Promise(() => {}),
    cancel: vi.fn(),
  }),
  startListening: vi.fn(),
  stopListening: vi.fn(async () => {}),
}

vi.mock('@proj-airi/stage-ui/stores/settings/audio-device', () => ({ useSettingsAudioDevice: () => devices }))
vi.mock('@proj-airi/stage-ui/stores/voice', () => ({ useVoiceStore: () => voice }))
vi.mock('@proj-airi/stage-ui/stores/chat/session-store', () => ({ useChatSessionStore: () => ({ activeSessionId: 'session' }) }))
vi.mock('@proj-airi/stage-ui/stores/modules/hearing', () => ({
  useHearingStore: () => hearing,
  listensContinuously: () => false,
  startsInputOnSpeech: () => false,
}))

describe('useClipReplay', () => {
  // Codex review on PR #30: a microphone change replaced the replay source while the page still showed the replay.
  it('stops the replay when the microphone input changes', async () => {
    const { replay, replaying, error } = useClipReplay()
    const sampleRate = 16000
    const done = replay(new Float32Array(sampleRate * 2), sampleRate)
    await new Promise(resolve => setTimeout(resolve, 100))
    expect(replaying.value).toBeDefined()

    const microphone = { name: 'other microphone' }
    devices.input = microphone
    await done

    expect(replaying.value).toBeUndefined()
    expect(error.value).toBe('A listening setting changed, so the replay stopped.')
    expect(voice.controller.replaceAudio).toHaveBeenLastCalledWith(microphone)
  })

  // Codex review on PR #30: another window can change the synchronized input mode while the replay keeps its old one.
  it('stops the replay when the input mode changes', async () => {
    const { replay, replaying, error } = useClipReplay()
    const sampleRate = 16000
    const done = replay(new Float32Array(sampleRate * 2), sampleRate)
    await new Promise(resolve => setTimeout(resolve, 100))

    hearing.inputMode = 'always-on'
    await done

    expect(replaying.value).toBeUndefined()
    expect(error.value).toBe('A listening setting changed, so the replay stopped.')
    hearing.inputMode = 'push-to-talk'
  })

  // Codex review on PR #30: an input that failed before capture left the replay running.
  it('stops the replay when the held input fails before it reads the clip', async () => {
    nextOutcome = Promise.resolve({ status: 'failed', stage: 'admission', error: new Error('No transcription provider') })
    const { replay, replaying, error } = useClipReplay()
    const sampleRate = 16000
    const started = performance.now()

    await replay(new Float32Array(sampleRate * 2), sampleRate)

    expect(performance.now() - started).toBeLessThan(1000)
    expect(replaying.value).toBeUndefined()
    expect(error.value).toBe('The input failed at the admission stage: No transcription provider')
  })
})
