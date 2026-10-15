import { SpanStatusCode } from '@opentelemetry/api'
import { IOAttributes, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it } from 'vitest'
import { computed } from 'vue'

import { startSpan } from '../../composables/use-io-tracer'
import { useIOTracerStore } from './io-tracer'

describe('useIOTracerStore', () => {
  afterEach(() => {
    useIOTracerStore().stopRecording()
  })

  it('updates views of a turn when more spans of its trace end', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()
    // The chart receives the turn list as a prop, so it keeps one array reference and reads spans through it.
    const turns = store.turns
    const spanNames = computed(() => turns.map(turn => turn.spans.map(span => span.name)))

    const voiceInput = startSpan(IOSpanNames.VoiceInput, undefined, { [IOAttributes.Subsystem]: IOSubsystems.VoiceInput })
    const recognition = startSpan(IOSpanNames.SpeechRecognition, voiceInput, { [IOAttributes.Subsystem]: IOSubsystems.ASR })
    recognition.end()
    expect(spanNames.value).toEqual([[IOSpanNames.SpeechRecognition]])

    voiceInput.end()

    expect(spanNames.value).toEqual([[IOSpanNames.SpeechRecognition, IOSpanNames.VoiceInput]])
    // The child ended first, but the turn starts where its parent started.
    expect(store.turns[0]!.startTs).toBe(store.turns[0]!.spans[1]!.startTs)
  })

  it('keeps the message of a span that ended with the error status', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    const failed = startSpan(IOSpanNames.TTSSynthesis, undefined, { [IOAttributes.Subsystem]: IOSubsystems.TTS })
    failed.setStatus({ code: SpanStatusCode.ERROR, message: 'Provider rejected the voice' })
    failed.end()
    startSpan(IOSpanNames.TTSSynthesis, undefined, { [IOAttributes.Subsystem]: IOSubsystems.TTS }).end()

    expect(store.turns.flatMap(turn => turn.spans).map(span => span.error)).toEqual(['Provider rejected the voice', undefined])
  })

  it('records a span once when the remote channel of the same window also delivers it', async () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    startSpan(IOSpanNames.SpeechRecognition, undefined, { [IOAttributes.Subsystem]: IOSubsystems.ASR }).end()
    // The BroadcastChannel copy arrives in a later task.
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(store.turns.flatMap(turn => turn.spans)).toHaveLength(1)
    expect(store.rawSpanCount).toBe(1)
  })

  it('records a span once when more turns than the limit end before the remote copies arrive', async () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    for (let index = 0; index < 60; index++)
      startSpan(IOSpanNames.SpeechRecognition, undefined, { [IOAttributes.Subsystem]: IOSubsystems.ASR }).end()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(store.rawSpanCount).toBe(60)
    expect(store.turns).toHaveLength(50)
  })

  it('keeps a cleared span out when its remote copy arrives after the clear', async () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    startSpan(IOSpanNames.SpeechRecognition, undefined, { [IOAttributes.Subsystem]: IOSubsystems.ASR }).end()
    store.clear()
    await new Promise(resolve => setTimeout(resolve, 50))

    expect(store.turns).toHaveLength(0)
    expect(store.rawSpanCount).toBe(0)
  })
})
