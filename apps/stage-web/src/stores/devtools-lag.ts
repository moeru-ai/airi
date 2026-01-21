import type { TraceEvent } from '@proj-airi/stage-shared'

import { defaultPerfTracer, exportCsv as exportCsvFile } from '@proj-airi/stage-shared'
import { defineStore } from 'pinia'
import { reactive, ref, watch } from 'vue'

import { createLagSampler } from '../composables/perf/register-lag-sampler'

export type LagMetric = 'fps' | 'frameDuration' | 'longtask' | 'memory'

interface Sample {
  ts: number
  value: number
  meta?: Record<string, any>
}

interface RecordingSnapshot {
  startedAt: number
  stoppedAt: number
  samples: Record<LagMetric, Sample[]>
}

interface HistogramBin {
  start: number
  end: number
  count: number
}

function createEmptySamples(): Record<LagMetric, Sample[]> {
  return {
    fps: [],
    frameDuration: [],
    longtask: [],
    memory: [],
  }
}

function pruneSamples(buffer: Sample[], cutoffTs: number) {
  while (buffer.length && buffer[0].ts < cutoffTs)
    buffer.shift()
}

function calcStats(values: number[]) {
  if (!values.length)
    return { avg: 0, p95: 0, latest: 0 }

  const total = values.reduce((acc, n) => acc + n, 0)
  const avg = total / values.length
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.max(0, Math.floor(0.95 * (sorted.length - 1)))
  const p95 = sorted[idx]
  const latest = values[values.length - 1]

  return { avg, p95, latest }
}

function buildHistogram(values: number[], bins = 20): HistogramBin[] {
  if (!values.length)
    return []

  const min = Math.min(...values)
  const max = Math.max(...values)
  if (min === max) {
    return [{
      start: min,
      end: max || min + 1,
      count: values.length,
    }]
  }

  const width = (max - min) / bins
  const buckets = Array.from({ length: bins }, (_, idx) => ({
    start: min + (idx * width),
    end: min + ((idx + 1) * width),
    count: 0,
  }))

  for (const value of values) {
    let binIndex = Math.floor((value - min) / width)
    if (binIndex >= bins)
      binIndex = bins - 1

    buckets[binIndex].count += 1
  }

  return buckets
}

export const useDevtoolsLagStore = defineStore('devtoolsLag', () => {
  const enabled = reactive({
    fps: false,
    frameDuration: false,
    longtask: false,
    memory: false,
  })

  const windowMs = 10000
  const buffers = reactive(createEmptySamples())

  const recording = ref(false)
  const recordingStartedAt = ref<number | null>(null)
  const recordingSamples = reactive(createEmptySamples())
  const lastRecording = ref<RecordingSnapshot>()
  let recordingTimeout: ReturnType<typeof setTimeout> | undefined

  const sampler = createLagSampler(defaultPerfTracer)
  let unsubscribeTracer: (() => void) | undefined
  let releaseTracer: (() => void) | undefined

  function resetRecordingSamples() {
    for (const metric of Object.keys(recordingSamples) as LagMetric[])
      recordingSamples[metric] = []
  }

  function applySample(metric: LagMetric, value: number, meta?: Record<string, any>) {
    const ts = performance.now()
    const cutoff = ts - windowMs

    const buffer = buffers[metric]
    buffer.push({ ts, value, meta })
    pruneSamples(buffer, cutoff)

    if (recording.value) {
      const sampleBuffer = recordingSamples[metric]
      sampleBuffer.push({ ts, value, meta })
    }
  }

  function startRecording() {
    if (recording.value)
      return

    recording.value = true
    recordingStartedAt.value = performance.now()
    resetRecordingSamples()

    recordingTimeout = setTimeout(() => stopRecording(), 60000)
  }

  function stopRecording(): RecordingSnapshot | undefined {
    if (!recording.value)
      return

    if (recordingTimeout) {
      clearTimeout(recordingTimeout)
      recordingTimeout = undefined
    }

    const stoppedAt = performance.now()
    const snapshot: RecordingSnapshot = {
      startedAt: recordingStartedAt.value || stoppedAt,
      stoppedAt,
      samples: {
        fps: [...recordingSamples.fps],
        frameDuration: [...recordingSamples.frameDuration],
        longtask: [...recordingSamples.longtask],
        memory: [...recordingSamples.memory],
      },
    }
    lastRecording.value = snapshot

    resetRecordingSamples()
    recordingStartedAt.value = null
    recording.value = false
    return snapshot
  }

  function stopAll() {
    sampler.stop()
    if (unsubscribeTracer) {
      unsubscribeTracer()
      unsubscribeTracer = undefined
    }
    releaseTracer?.()
    releaseTracer = undefined
  }

  function ensureSampler() {
    const anyEnabled = enabled.fps || enabled.frameDuration || enabled.longtask || enabled.memory
    if (!anyEnabled) {
      stopAll()
      return
    }

    // Start tracer listener if needed
    if (!unsubscribeTracer) {
      unsubscribeTracer = defaultPerfTracer.subscribe((event: TraceEvent) => {
        if (event.tracerId !== 'lag')
          return

        const metric = event.name as LagMetric
        if (!['fps', 'frameDuration', 'longtask', 'memory'].includes(metric))
          return

        // Only accept samples for enabled metrics
        const isMetricEnabled = enabled[metric]

        if (!isMetricEnabled)
          return

        const value = typeof event.duration === 'number' ? event.duration : 0
        applySample(metric, value, event.meta)
      })
    }

    if (!releaseTracer)
      releaseTracer = defaultPerfTracer.acquire('lag-overlay')
    sampler.start({
      fps: enabled.fps,
      frameDuration: enabled.frameDuration,
      longtask: enabled.longtask,
      memory: enabled.memory,
    })
  }

  function toggleAll(on: boolean) {
    enabled.fps = on
    enabled.frameDuration = on
    enabled.longtask = on
    enabled.memory = on
    ensureSampler()
  }

  function exportCsv(snapshot?: RecordingSnapshot) {
    const target = snapshot ?? lastRecording.value
    if (!target)
      return

    const rows: Array<Array<string | number>> = [['metric', 'ts', 'value', 'meta']]
    for (const metric of Object.keys(target.samples) as LagMetric[]) {
      for (const sample of target.samples[metric]) {
        rows.push([
          metric,
          sample.ts.toFixed(3),
          sample.value,
          JSON.stringify(sample.meta ?? {}),
        ])
      }
    }

    exportCsvFile(rows, 'lag-recording')
  }

  // React to enablement changes
  watch(
    () => ({ ...enabled }),
    () => {
      ensureSampler()
    },
    { deep: true },
  )

  // Cleanup on tab close
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      stopRecording()
      stopAll()
    })
  }

  return {
    enabled,
    buffers,
    recording,
    lastRecording,
    startRecording,
    stopRecording,
    exportCsv,
    toggleAll,
    calcStats,
    buildHistogram,
  }
})
