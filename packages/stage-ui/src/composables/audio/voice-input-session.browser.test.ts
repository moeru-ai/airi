import type { VoiceInputSessionOptions } from './voice-input-session'

import { createPinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render } from 'vitest-browser-vue'
import { defineComponent, h } from 'vue'
import { createI18n } from 'vue-i18n'

import { useVoiceInputSession } from './voice-input-session'

let context: AudioContext | undefined
let session: ReturnType<typeof useVoiceInputSession> | undefined
let stream: MediaStream | undefined

afterEach(async () => {
  await session?.stop()
  stream?.getTracks().forEach(track => track.stop())
  await context?.close()
})

function mountSession(options: VoiceInputSessionOptions) {
  context = new AudioContext()
  const destination = context.createMediaStreamDestination()
  const oscillator = context.createOscillator()
  oscillator.connect(destination)
  oscillator.start()
  stream = destination.stream
  const screen = render(defineComponent({
    setup() {
      session = useVoiceInputSession(stream, options)
      return () => h('button', { onClick: () => context?.resume() }, 'Enable microphone')
    },
  }), { global: { plugins: [createPinia(), createI18n({ legacy: false, locale: 'en', messages: { en: {} } })] } })
  return screen
}

describe('voice segment ownership', () => {
  // https://github.com/moeru-ai/airi/pull/2708
  // ROOT CAUSE: Recording completion reconstructed metadata after the selected session changed.
  it('keeps the owner captured before the first asynchronous segment gate (Issue #2708)', async () => {
    const gate = Promise.withResolvers<boolean>()
    let currentSession = 'session-a'
    const started = vi.fn()
    const ready = vi.fn()
    const screen = mountSession({
      captureSegmentMetadata: () => ({ sessionId: currentSession }),
      canStartSegment: () => gate.promise,
      onSegmentStarted: started,
      onRecordingReady: ready,
      inspectBeforeTranscription: () => ({ skip: true }),
    })
    await screen.getByRole('button', { name: 'Enable microphone' }).click()
    const starting = session!.startSegment()
    currentSession = 'session-b'
    gate.resolve(true)
    expect(await starting).toBe(true)
    expect(started).toHaveBeenCalledWith(expect.objectContaining({ metadata: { sessionId: 'session-a' } }))
    // The real WAV recorder needs captured samples before finalization.
    await new Promise(resolve => setTimeout(resolve, 150))
    await session!.stopSegment()
    expect(ready).toHaveBeenCalledWith(expect.objectContaining({ metadata: { sessionId: 'session-a' } }))
  })

  // https://github.com/moeru-ai/airi/pull/2708
  // ROOT CAUSE: Segment startup did not recheck ownership after awaiting the caller gate.
  it('does not start a recorder after a pending segment was stopped (Issue #2708)', async () => {
    const gate = Promise.withResolvers<boolean>()
    const screen = mountSession({ canStartSegment: () => gate.promise })
    await screen.getByRole('button', { name: 'Enable microphone' }).click()
    const starting = session!.startSegment()
    await session!.stop()
    gate.resolve(true)
    expect(await starting).toBe(false)
    expect(session!.isRecording.value).toBe(false)
  })
})
