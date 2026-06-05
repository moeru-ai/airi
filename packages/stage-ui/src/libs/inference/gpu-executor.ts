/**
 * Central GPU work executor with cooperative preemption.
 *
 * Serializes all GPU-bound work — model loads AND inference (transcribe /
 * generate / process) — across every adapter onto a single slot (concurrency
 * 1). Independent inference workers each own a separate `GPUDevice`, so without
 * a shared gate their VRAM-intensive kernels can overlap, exhaust VRAM, and
 * crash a GPU context. Routing loads and inference through one executor means a
 * load can never run alongside an inference kernel, and two inference kernels
 * never run at once. Higher-priority work is dequeued first (see
 * {@link GPU_PRIORITY}). See ADR-0001 (docs/ai/context/plans).
 *
 * Preemption (Phase 2): long streaming work (e.g. a transcription) calls
 * {@link GpuSlot.yield} between chunks. If a higher-priority unit is waiting,
 * the holder is parked and the challenger runs, then the holder resumes — so a
 * queued high-priority op (e.g. TTS) interleaves ahead of a long low-priority
 * stream instead of waiting it out. Linear aging bounds starvation of the
 * lower-priority op under a continuous higher-priority stream.
 *
 * Cancellation: pass an `AbortSignal` in {@link RunOptions} to `run()`. A
 * still-queued or parked entry is removed and rejected with
 * `InferenceAbortError`; an already-active entry is not interrupted (its `work`
 * callback honors the same signal).
 */

import { InferenceAbortError } from './protocol'

/** Cooperative scheduling handle passed to {@link GpuExecutor.run} work. */
export interface GpuSlot {
  /**
   * Cooperative preemption point. If a higher-(aged-)priority unit is waiting,
   * release the slot, let it run, and resume when this unit is again the
   * highest-ready; otherwise a cheap no-op. Streaming work should call this
   * between chunks. Unary work never needs to.
   */
  yield: () => Promise<void>
}

interface Entry<T = any> {
  modelId: string
  priority: number
  /** Priority bonus accrued while waiting; bounds starvation. Reset on activation. */
  age: number
  work: (slot: GpuSlot) => Promise<T>
  resolve: (value: T) => void
  reject: (error: unknown) => void
  signal?: AbortSignal
  abortHandler?: () => void
  /**
   * Set while parked at a yield point; presence distinguishes a parked entry
   * (resume the suspended `work`) from a never-started one (invoke `work`) in
   * {@link activate}. Resolving resumes the suspended `work`, rejecting aborts it.
   */
  resume?: { resolve: () => void, reject: (error: unknown) => void }
}

/** Options for {@link GpuExecutor.run}. */
export interface RunOptions {
  /** Abort the queued work. Rejects the returned promise with `InferenceAbortError`. */
  signal?: AbortSignal
}

export interface GpuExecutor {
  /**
   * Run a unit of GPU-bound work under the global concurrency-1 slot.
   *
   * Use when:
   * - Dispatching a model load or an inference invoke that competes for the GPU.
   *
   * Expects:
   * - `work` triggers the GPU work (e.g. an Eventa invoke) and resolves when it
   *   completes. Streaming `work` may call `slot.yield()` between chunks to allow
   *   a higher-priority unit to preempt; unary `work` ignores the slot.
   *
   * Returns:
   * - `work`'s resolved value. If another unit is active, this one waits in a
   *   priority queue (highest effective priority first).
   */
  run: <T>(
    modelId: string,
    priority: number,
    work: (slot: GpuSlot) => Promise<T>,
    options?: RunOptions,
  ) => Promise<T>

  /** Model IDs waiting (queued or parked). */
  readonly pending: string[]

  /** Model ID of the unit currently holding the slot, or null. */
  readonly active: string | null
}

/** Construction options for {@link createGpuExecutor}. */
export interface GpuExecutorOptions {
  /**
   * Priority a waiting unit gains per scheduling pass it is held back, so a
   * lower-priority unit eventually preempts a continuous higher-priority stream
   * instead of starving. A waiter takes the slot once `priority + age*agingStep`
   * exceeds the holder's effective priority.
   *
   * @default 10
   */
  agingStep?: number
}

export function createGpuExecutor(options?: GpuExecutorOptions): GpuExecutor {
  const agingStep = options?.agingStep ?? 10
  const waiters: Entry[] = []
  let current: Entry | null = null

  const effective = (entry: Entry): number => entry.priority + entry.age * agingStep

  function detach(entry: Entry): void {
    if (entry.signal && entry.abortHandler) {
      entry.signal.removeEventListener('abort', entry.abortHandler)
      entry.abortHandler = undefined
    }
  }

  function removeWaiter(entry: Entry): boolean {
    const i = waiters.indexOf(entry)
    if (i < 0)
      return false
    waiters.splice(i, 1)
    return true
  }

  /** Highest effective-priority waiter, or null. Ties keep the earliest enqueued. */
  function peekWaiter(): Entry | null {
    let best: Entry | null = null
    for (const w of waiters) {
      if (!best || effective(w) > effective(best))
        best = w
    }
    return best
  }

  /** Give the slot to `entry`: resume it if parked, else start its `work`. */
  function activate(entry: Entry): void {
    removeWaiter(entry)
    entry.age = 0
    current = entry
    if (entry.resume) {
      const resume = entry.resume
      entry.resume = undefined
      resume.resolve()
      return
    }
    entry.work({ yield: () => yieldSlot(entry) })
      .then(value => onWorkSettled(entry, () => entry.resolve(value)))
      .catch((error: unknown) => onWorkSettled(entry, () => entry.reject(error)))
  }

  function onWorkSettled(entry: Entry, settle: () => void): void {
    detach(entry)
    if (current === entry)
      current = null
    settle()
    schedule()
  }

  function schedule(): void {
    if (current)
      return
    const next = peekWaiter()
    if (next)
      activate(next)
  }

  /**
   * Cooperative yield from the current holder `entry`. Ages the waiters (they
   * have waited through another of `entry`'s chunks), then hands the slot to a
   * challenger whose effective priority now exceeds the holder's; otherwise the
   * holder keeps the slot. Returns a promise that resolves when `entry` is
   * activated again (or rejects if it is aborted while parked).
   */
  function yieldSlot(entry: Entry): Promise<void> {
    if (current !== entry)
      return Promise.resolve()
    for (const w of waiters)
      w.age++
    const challenger = peekWaiter()
    if (!challenger || effective(challenger) <= effective(entry))
      return Promise.resolve()
    current = null
    entry.age = 0
    const parked = new Promise<void>((resolve, reject) => {
      entry.resume = { resolve, reject }
    })
    waiters.push(entry)
    activate(challenger)
    return parked
  }

  function run<T>(
    modelId: string,
    priority: number,
    work: (slot: GpuSlot) => Promise<T>,
    options?: RunOptions,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const entry: Entry<T> = { modelId, priority, age: 0, work, resolve, reject, signal: options?.signal }

      if (options?.signal) {
        if (options.signal.aborted) {
          const reason = options.signal.reason
          reject(reason instanceof Error ? reason : new InferenceAbortError())
          return
        }
        entry.abortHandler = () => {
          // Active work isn't interrupted — its own signal handling rejects it.
          if (current === entry)
            return
          if (!removeWaiter(entry))
            return
          const reason = options.signal!.reason
          const error = reason instanceof Error ? reason : new InferenceAbortError()
          if (entry.resume) {
            // Parked mid-stream: unwind the suspended work; its rejection settles the outer promise.
            const resume = entry.resume
            entry.resume = undefined
            resume.reject(error)
          }
          else {
            detach(entry)
            reject(error)
          }
        }
        options.signal.addEventListener('abort', entry.abortHandler)
      }

      waiters.push(entry)
      schedule()
    })
  }

  return {
    run,
    get pending() { return waiters.map(e => e.modelId) },
    get active() { return current ? current.modelId : null },
  }
}

/**
 * Priority for GPU work dispatched through {@link GpuExecutor.run}. Higher runs
 * first.
 *
 * Interactive inference outranks model loads, which outrank non-conversational
 * background work. Within the speech loop, output (TTS) is prioritized over
 * input (STT) to protect audio continuity — the latency-inverted order of the
 * STT → LLM → TTS pipeline. A local LLM (web-rwkv) sits between them: its
 * generation outranks STT (the user is awaiting a reply) but yields to TTS
 * playback. Remote LLMs are network-bound and not scheduled here. See ADR-0001 §9.2.
 */
export const GPU_PRIORITY = {
  TTS_GENERATE: 100,
  LLM_GENERATE: 90,
  STT_TRANSCRIBE: 80,
  TTS_LOAD: 60,
  STT_LOAD: 50,
  LLM_LOAD: 40,
  BG_REMOVAL_PROCESS: 20,
  BG_REMOVAL_LOAD: 10,
} as const
