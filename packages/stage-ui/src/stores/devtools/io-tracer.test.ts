import type { ReadableSpan } from '../../composables/use-io-tracer'

import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { createPinia, setActivePinia } from 'pinia'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import { setIOTraceSource, startSpan, subscribeIOSpan } from '../../composables/use-io-tracer'
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

  it('ends a spoken turn when its playback ends, not when its LLM ends', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    const interaction = startSpan(IOSpanNames.InteractionTurn)
    const llm = startSpan(IOSpanNames.LLMInference, interaction, { [IOAttributes.Subsystem]: IOSubsystems.LLM })
    const speech = startSpan(IOSpanNames.SpeechTurn, interaction)
    llm.end()
    interaction.end()
    const playback = startSpan(IOSpanNames.AudioPlayback, speech, { [IOAttributes.Subsystem]: IOSubsystems.Playback })
    playback.end()
    speech.end()

    const turn = store.turns[0]!
    const playbackSpan = turn.spans.find(span => span.name === IOSpanNames.AudioPlayback)!
    expect(turn.endTs).toBeGreaterThanOrEqual(playbackSpan.endTs!)
  })

  it('reads the time to first token from the first token event', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    const llm = startSpan(IOSpanNames.LLMInference, undefined, { [IOAttributes.Subsystem]: IOSubsystems.LLM })
    llm.addEvent(IOEvents.LLMFirstToken, { [IOAttributes.LLM_TTFT]: 408 })
    llm.end()

    expect(store.turns[0]!.spans[0]!.meta.ttftMs).toBe(408)
  })

  it('keeps span attributes when an event of the span has an attribute with the same name', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    const dispatch = startSpan(IOSpanNames.StreamingControlDispatch, undefined, {
      [IOAttributes.Subsystem]: IOSubsystems.StreamingControl,
      [IOAttributes.StreamingControlReason]: 'unknown-token',
    })
    dispatch.addEvent(IOEvents.StreamingControlHandlerError, { [IOAttributes.StreamingControlReason]: 'handler failed' })
    dispatch.end()

    const span = store.turns[0]!.spans[0]!
    expect(span.meta.reason).toBe('unknown-token')
    expect(span.events?.[0]?.meta.reason).toBe('handler failed')
  })

  it('drops the raw spans of evicted turns', () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    store.startRecording()

    for (let index = 0; index < 60; index++)
      startSpan(IOSpanNames.LLMInference, undefined, { [IOAttributes.Subsystem]: IOSubsystems.LLM }).end()

    expect(store.turns).toHaveLength(50)
    expect(store.rawSpanCount).toBe(50)
  })

  it('shows the spans that a trace source kept before recording started, once each', async () => {
    setActivePinia(createPinia())
    const store = useIOTracerStore()
    const ended: ReadableSpan[] = []
    const stopCapture = subscribeIOSpan(span => ended.push(span))
    startSpan(IOSpanNames.LLMInference, undefined, { [IOAttributes.Subsystem]: IOSubsystems.LLM }).end()
    stopCapture()
    const unsubscribe = vi.fn()
    let onSpan: ((span: ReadableSpan) => void) | undefined
    // The hub of the Electron main process is the real source. It is outside this package.
    const stopSource = setIOTraceSource({
      subscribe: async (listener) => {
        onSpan = listener
        return { spans: ended, unsubscribe }
      },
    })

    store.startRecording()
    await vi.waitFor(() => expect(store.turns).toHaveLength(1))
    // The source can also send a span of its snapshot as a later span.
    onSpan?.(ended[0]!)
    store.stopRecording()
    stopSource()

    expect(store.turns[0]!.spans).toHaveLength(1)
    expect(store.recordingStartTs).toBeLessThanOrEqual(store.turns[0]!.startTs)
    expect(unsubscribe).toHaveBeenCalledTimes(1)
  })
})
