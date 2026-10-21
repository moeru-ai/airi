import type { Attributes } from '@opentelemetry/api'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { IOSpan, IOSubsystem, IOTurn } from '@proj-airi/stage-shared'

import { hrTimeToMilliseconds } from '@opentelemetry/core'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { computed, ref, triggerRef } from 'vue'

import { initIOTracer, onIOSpan, onRemoteIOSpan } from '../../composables/use-io-tracer'
import { toOTLPTrace } from './io-tracer-otlp'

const MAX_TURNS = 50

function attrsToMeta(attrs: Attributes): Record<string, any> {
  const meta: Record<string, any> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const shortKey = key === IOAttributes.TooltipKeys
      ? 'tooltipKeys'
      : key.includes('.')
        ? key.split('.').at(-1)!
        : key
    meta[shortKey] = value
  }
  return meta
}

export const useIOTracerStore = defineStore('devtools:io-tracer', () => {
  const turns = ref<IOTurn[]>([])
  const isRecording = ref(false)
  const selectedSpanId = ref<string | null>(null)
  const recordingStartTs = ref(0)
  const rawSpanCount = ref(0)

  const turnsByTraceId = new Map<string, IOTurn>()
  /** Latest end time of any span of each trace, including spans that the chart does not draw. */
  const latestEndByTraceId = new Map<string, number>()
  /** Traces whose `Interaction turn` span ended. Only these turns have an end. */
  const settledTraceIds = new Set<string>()

  const rawSpans: ReadableSpan[] = []
  let unsubscribeRemote: (() => void) | undefined

  function notifyUpdate() {
    triggerRef(turns)
  }

  const activeTurn = computed(() => {
    if (turns.value.length === 0)
      return undefined
    const last = turns.value.at(-1)
    return last?.endTs == null ? last : undefined
  })

  const selectedSpan = computed(() => {
    if (!selectedSpanId.value)
      return undefined
    for (const turn of turns.value) {
      const span = turn.spans.find(s => s.id === selectedSpanId.value)
      if (span)
        return { span, turn }
    }
    return undefined
  })

  function handleSpan(readable: ReadableSpan) {
    rawSpans.push(readable)
    rawSpanCount.value++

    const spanCtx = readable.spanContext()
    const traceId = spanCtx.traceId
    const spanId = spanCtx.spanId
    const startMs = hrTimeToMilliseconds(readable.startTime)
    const endMs = readable.ended ? hrTimeToMilliseconds(readable.endTime) : undefined

    function getOrCreateTurn(): IOTurn {
      let turn = turnsByTraceId.get(traceId)
      if (!turn) {
        turns.value.push({
          id: traceId,
          startTs: startMs,
          spans: [],
        })
        // The reactive copy, not the raw object. Later spans of this trace mutate it, and views that hold the turn
        // list, such as the chart through its prop, only see mutations through the proxy.
        turn = turns.value.at(-1)!
        turnsByTraceId.set(traceId, turn)

        evictOldTurns()
      }
      // Spans arrive when they end, so a child, such as a VAD segment, can arrive before the span that starts the turn.
      if (startMs < turn.startTs)
        turn.startTs = startMs
      // A spoken turn ends when its last playback ends. The `Speech turn` span outlives the `Interaction turn` span.
      if (settledTraceIds.has(traceId))
        turn.endTs = latestEndByTraceId.get(traceId)
      return turn
    }

    if (endMs != null)
      latestEndByTraceId.set(traceId, Math.max(latestEndByTraceId.get(traceId) ?? endMs, endMs))

    if (readable.name === IOSpanNames.InteractionTurn) {
      settledTraceIds.add(traceId)
      const turn = getOrCreateTurn()
      const text = readable.attributes[IOAttributes.ASRText]
      if (typeof text === 'string')
        turn.inputText = text

      notifyUpdate()
      return
    }

    const subsystem = readable.attributes[IOAttributes.Subsystem] as IOSubsystem | undefined

    if (!subsystem) {
      // A span without a subsystem, such as `Speech turn`, is not drawn. It can still move the end of its turn.
      if (turnsByTraceId.has(traceId))
        getOrCreateTurn()
      notifyUpdate()
      return
    }

    if (readable.name === IOSpanNames.TTSSynthesis) {
      const turn = getOrCreateTurn()
      const text = readable.attributes[IOAttributes.TTSText]
      if (typeof text === 'string' && !turn.outputText)
        turn.outputText = text
    }

    const turn = getOrCreateTurn()
    const meta = attrsToMeta(readable.attributes)
    const events = readable.events.map(event => ({
      name: event.name,
      timeTs: hrTimeToMilliseconds(event.time),
      meta: attrsToMeta(event.attributes ?? {}),
    }))

    // Event attributes stay in `events`. Copying them into the span meta overwrote span attributes with the same short key.
    const firstToken = readable.events.find(event => event.name === IOEvents.LLMFirstToken)
    if (firstToken) {
      meta.firstTokenTs = hrTimeToMilliseconds(firstToken.time)
      const ttft = firstToken.attributes?.[IOAttributes.LLM_TTFT]
      if (typeof ttft === 'number')
        meta.ttftMs = ttft
    }

    if (subsystem === IOSubsystems.ASR && typeof readable.attributes[IOAttributes.ASRText] === 'string')
      turn.inputText = (turn.inputText ?? '') + (readable.attributes[IOAttributes.ASRText] as string)
    if (subsystem === IOSubsystems.LLM && typeof meta.text_length === 'number')
      turn.outputText = `(${meta.text_length} chars)`

    const segmentId = readable.attributes[IOAttributes.TTSSegmentId]

    const ioSpan: IOSpan = {
      id: spanId,
      traceId,
      parentSpanId: readable.parentSpanContext?.spanId,
      ttsCorrelationId: typeof segmentId === 'string' ? segmentId : undefined,
      subsystem,
      name: readable.name,
      startTs: startMs,
      endTs: endMs,
      meta,
      events,
    }

    turn.spans.push(ioSpan)
    notifyUpdate()
  }

  function evictOldTurns() {
    let evicted = false
    while (turns.value.length > MAX_TURNS) {
      const turn = turns.value.shift()
      if (!turn)
        break
      turnsByTraceId.delete(turn.id)
      latestEndByTraceId.delete(turn.id)
      settledTraceIds.delete(turn.id)
      evicted = true
    }
    if (!evicted)
      return

    // The export reads the raw spans, so it must contain the same turns as the views.
    const kept = rawSpans.filter(span => turnsByTraceId.has(span.spanContext().traceId))
    rawSpans.length = 0
    rawSpans.push(...kept)
    rawSpanCount.value = rawSpans.length
  }

  function startRecording() {
    if (isRecording.value)
      return

    initIOTracer()
    onIOSpan(handleSpan)
    unsubscribeRemote = onRemoteIOSpan(handleSpan)
    recordingStartTs.value = performance.timeOrigin + performance.now()
    isRecording.value = true

    console.info('[IOTracer] Recording started (OTel mode, local + remote)')
  }

  function stopRecording() {
    if (!isRecording.value)
      return

    onIOSpan(undefined)
    unsubscribeRemote?.()
    unsubscribeRemote = undefined
    isRecording.value = false
  }

  function clear() {
    turns.value = []
    turnsByTraceId.clear()
    latestEndByTraceId.clear()
    settledTraceIds.clear()
    rawSpans.length = 0
    rawSpanCount.value = 0
    selectedSpanId.value = null
    recordingStartTs.value = performance.timeOrigin + performance.now()
  }

  function selectSpan(spanId: string | null) {
    selectedSpanId.value = spanId
  }

  function exportOTLP() {
    if (rawSpans.length === 0)
      return

    const otlpPayload = toOTLPTrace(rawSpans)

    const json = JSON.stringify(otlpPayload, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `trace_${Date.now()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return {
    turns,
    activeTurn,
    isRecording,
    rawSpanCount,
    recordingStartTs,
    selectedSpanId,
    selectedSpan,
    startRecording,
    stopRecording,
    clear,
    selectSpan,
    exportOTLP,
  }
})
