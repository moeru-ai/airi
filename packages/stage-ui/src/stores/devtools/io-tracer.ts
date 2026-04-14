import type { Attributes } from '@opentelemetry/api'
import type { ReadableSpan } from '@opentelemetry/sdk-trace-base'
import type { IOSpan, IOSubsystem, IOTurn } from '@proj-airi/stage-shared'

import { hrTimeToMilliseconds, hrTimeToNanoseconds } from '@opentelemetry/core'
import { IOAttributes, IOEvents, IOSpanNames, IOSubsystems } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { computed, ref, triggerRef } from 'vue'

import { activeTurnSpan, initIOTracer, onIOSpan, onRemoteIOSpan } from '../../composables/use-io-tracer'

const MAX_TURNS = 50

function attrsToMeta(attrs: Attributes): Record<string, any> {
  const meta: Record<string, any> = {}
  for (const [key, value] of Object.entries(attrs)) {
    const shortKey = key.includes('.') ? key.split('.').at(-1)! : key
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

  function formatOtlpValue(value: unknown): Record<string, unknown> {
    if (typeof value === 'string')
      return { stringValue: value }
    if (typeof value === 'number')
      return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value }
    if (typeof value === 'boolean')
      return { boolValue: value }
    if (Array.isArray(value))
      return { arrayValue: { values: value.map(v => formatOtlpValue(v)) } }
    return { stringValue: String(value) }
  }

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
        turn = {
          id: traceId,
          startTs: startMs,
          spans: [],
        }
        turnsByTraceId.set(traceId, turn)
        turns.value.push(turn)

        while (turns.value.length > MAX_TURNS) {
          const evicted = turns.value.shift()
          if (evicted)
            turnsByTraceId.delete(evicted.id)
        }
      }
      return turn
    }

    if (readable.name === IOSpanNames.InteractionTurn) {
      const turn = getOrCreateTurn()
      if (endMs)
        turn.endTs = endMs
      const text = readable.attributes[IOAttributes.ASRText]
      if (typeof text === 'string')
        turn.inputText = text

      notifyUpdate()
      return
    }

    const subsystem = readable.attributes[IOAttributes.Subsystem] as IOSubsystem | undefined

    if (!subsystem) {
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

    for (const event of readable.events) {
      const eventAttrs = event.attributes ?? {}
      for (const [key, value] of Object.entries(eventAttrs)) {
        const shortKey = key.includes('.') ? key.split('.').at(-1)! : key
        meta[shortKey] = value
      }
      if (event.name === IOEvents.LLMFirstToken) {
        meta.firstTokenTs = hrTimeToMilliseconds(event.time)
      }
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
    }

    turn.spans.push(ioSpan)
    notifyUpdate()
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

    activeTurnSpan.value?.end()
    activeTurnSpan.value = undefined

    onIOSpan(undefined)
    unsubscribeRemote?.()
    unsubscribeRemote = undefined
    isRecording.value = false
  }

  function clear() {
    turns.value = []
    turnsByTraceId.clear()
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

    const spans = rawSpans.map((span) => {
      const ctx = span.spanContext()
      const parentCtx = span.parentSpanContext

      return {
        traceId: ctx.traceId,
        spanId: ctx.spanId,
        parentSpanId: parentCtx?.spanId ?? '',
        name: span.name,
        kind: span.kind,
        startTimeUnixNano: String(hrTimeToNanoseconds(span.startTime)),
        endTimeUnixNano: span.ended ? String(hrTimeToNanoseconds(span.endTime)) : '0',
        attributes: Object.entries(span.attributes).map(([key, value]) => ({
          key,
          value: formatOtlpValue(value),
        })),
        events: span.events.map(event => ({
          timeUnixNano: String(hrTimeToNanoseconds(event.time)),
          name: event.name,
          attributes: Object.entries(event.attributes ?? {}).map(([key, value]) => ({
            key,
            value: formatOtlpValue(value),
          })),
        })),
        status: {
          code: span.status.code,
          message: span.status.message ?? '',
        },
      }
    })

    const otlpPayload = {
      resourceSpans: [{
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'airi-io' } },
          ],
        },
        scopeSpans: [{
          scope: { name: 'io' },
          spans,
        }],
      }],
    }

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
