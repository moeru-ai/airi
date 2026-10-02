import type { PerfTracer } from '@proj-airi/stage-shared'

interface LagEnabled {
  fps: boolean
  frameDuration: boolean
  longtask: boolean
  memory: boolean
}

type LagMetricSupport = Readonly<Record<keyof LagEnabled, boolean>>

/**
 * Creates a browser-local sampler for live performance metrics.
 *
 * Unsupported metrics stay disabled because their Web APIs do not produce
 * comparable fallback values.
 */
export function createLagSampler(tracer: PerfTracer) {
  let rafId: number | undefined
  let lastTs: number | undefined
  let longTaskObserver: PerformanceObserver | undefined
  let memoryTimer: ReturnType<typeof setInterval> | undefined

  const supported: LagMetricSupport = {
    fps: typeof requestAnimationFrame === 'function',
    frameDuration: typeof requestAnimationFrame === 'function',
    longtask: typeof PerformanceObserver !== 'undefined'
      && PerformanceObserver.supportedEntryTypes.includes('longtask'),
    memory: typeof performance !== 'undefined' && 'memory' in performance,
  }

  function stopRaf() {
    if (rafId !== undefined) {
      cancelAnimationFrame(rafId)
      rafId = undefined
    }
    lastTs = undefined
  }

  function startRaf() {
    stopRaf()

    const loop = (ts: number) => {
      if (lastTs !== undefined) {
        const delta = ts - lastTs
        const fps = delta > 0 ? 1000 / delta : 0

        tracer.emit({
          tracerId: 'lag',
          name: 'fps',
          ts,
          duration: fps,
        })

        tracer.emit({
          tracerId: 'lag',
          name: 'frameDuration',
          ts,
          duration: delta,
        })
      }

      lastTs = ts
      rafId = requestAnimationFrame(loop)
    }

    rafId = requestAnimationFrame(loop)
  }

  function stopLongTaskObserver() {
    longTaskObserver?.disconnect()
    longTaskObserver = undefined
  }

  function startLongTaskObserver() {
    stopLongTaskObserver()
    if (!supported.longtask)
      return

    try {
      longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          tracer.emit({
            tracerId: 'lag',
            name: 'longtask',
            ts: entry.startTime,
            duration: entry.duration,
          })
        }
      })
      longTaskObserver.observe({ type: 'longtask', buffered: true })
    }
    catch (error) {
      console.warn('[LagSampler] Failed to start longtask observer', error)
    }
  }

  function stopMemoryTimer() {
    if (memoryTimer) {
      clearInterval(memoryTimer)
      memoryTimer = undefined
    }
  }

  function startMemoryTimer() {
    stopMemoryTimer()
    const perfWithMemory = performance as Performance & { memory?: { usedJSHeapSize: number } }
    if (!supported.memory || !perfWithMemory.memory)
      return

    memoryTimer = setInterval(() => {
      tracer.emit({
        tracerId: 'lag',
        name: 'memory',
        ts: performance.now(),
        duration: perfWithMemory.memory?.usedJSHeapSize ?? 0,
      })
    }, 1000)
  }

  function start(enabled: LagEnabled) {
    stop()

    if ((enabled.fps && supported.fps) || (enabled.frameDuration && supported.frameDuration))
      startRaf()

    if (enabled.longtask && supported.longtask)
      startLongTaskObserver()

    if (enabled.memory && supported.memory)
      startMemoryTimer()
  }

  function stop() {
    stopRaf()
    stopLongTaskObserver()
    stopMemoryTimer()
  }

  return {
    supported,
    start,
    stop,
  }
}
