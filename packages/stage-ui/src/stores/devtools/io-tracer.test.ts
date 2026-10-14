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
})
