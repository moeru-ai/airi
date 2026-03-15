import type { FrameSource, MocapBackend, MocapConfig, MocapEngine, MocapJob, PerceptionPartial, PerceptionState } from './types'

export function createStats() {
  let lastTs = 0
  let smoothedFps = 0

  function tick(nowMs: number) {
    if (!lastTs) {
      lastTs = nowMs
      smoothedFps = 0
      return 0
    }

    const dt = nowMs - lastTs
    lastTs = nowMs

    if (dt <= 0)
      return smoothedFps

    const fps = 1000 / dt
    smoothedFps = smoothedFps ? (smoothedFps * 0.9 + fps * 0.1) : fps

    return smoothedFps
  }

  return { tick }
}

export function createScheduler(initialConfig: MocapConfig) {
  let config = initialConfig
  const lastRun: Record<MocapJob, number> = { pose: 0, hands: 0, face: 0 }

  function updateConfig(next: MocapConfig) {
    config = next
  }

  function plan(nowMs: number): MocapJob[] {
    const jobs: MocapJob[] = []

    for (const job of ['pose', 'hands', 'face'] as const) {
      if (!config.enabled[job])
        continue

      const hz = config.hz[job]
      if (!hz || hz <= 0)
        continue

      if (nowMs - lastRun[job] >= (1000 / hz))
        jobs.push(job)
    }

    for (const j of jobs)
      lastRun[j] = nowMs

    return jobs
  }

  return {
    plan,
    updateConfig,
  }
}

export function createMocapEngine(backend: MocapBackend, initialConfig: MocapConfig): MocapEngine {
  let config = initialConfig
  const scheduler = createScheduler(config)
  const stats = createStats()

  let running = false
  let droppedFrames = 0
  let lastPartial: PerceptionPartial = {}
  let rafId: number | undefined

  async function init() {
    await backend.init(config)
  }

  function updateConfig(next: MocapConfig) {
    config = next
    scheduler.updateConfig(next)
  }

  function resetState() {
    lastPartial = {}
    droppedFrames = 0
  }

  function start(
    source: FrameSource,
    onState: (state: PerceptionState) => void,
    options?: { onError?: (error: unknown) => void },
  ) {
    running = true
    resetState()

    const tick = async () => {
      try {
        if (!running)
          return

        const frame = source.getFrame()
        const now = performance.now()

        // Skip this frame if the backend is still busy.
        if (backend.isBusy()) {
          droppedFrames++
          rafId = requestAnimationFrame(tick)
          return
        }

        const jobs = scheduler.plan(now)
        const t0 = performance.now()
        const partial = jobs.length > 0 ? await backend.run(frame, jobs, now) : {}
        const latencyMs = performance.now() - t0

        lastPartial = { ...lastPartial, ...partial }

        onState({
          t: now,
          ...lastPartial,
          quality: {
            fps: stats.tick(now),
            latencyMs,
            droppedFrames,
            backend: 'mediapipe',
            mode: 'split-tasks',
          },
        })

        rafId = requestAnimationFrame(tick)
      }
      catch (err) {
        // Stop the loop to avoid spamming errors; consumers can restart.
        stop()
        options?.onError?.(err)
      }
    }

    rafId = requestAnimationFrame(tick)
  }

  function stop() {
    running = false
    if (rafId != null)
      cancelAnimationFrame(rafId)
    rafId = undefined
  }

  return {
    init,
    start,
    stop,
    updateConfig,
    resetState,
  }
}
