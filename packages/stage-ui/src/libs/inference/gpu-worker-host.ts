/**
 * Resilient GPU inference worker host.
 *
 * Owns the lifecycle and device-loss resilience of a single GPU-backed
 * inference Web Worker, so each adapter (kokoro, whisper, …) stops re-deriving
 * the same crash-recovery machinery. It hides:
 *
 * - **Worker lifecycle**: lazy spawn, native `'error'` listener wiring, teardown.
 * - **Crash recovery**: a re-entrancy-guarded `handleWorkerError` that records
 *   device-loss telemetry, aborts in-flight GPU work, tears the worker down, and
 *   reschedules a respawn with exponential backoff (timer tracked so terminate()
 *   can cancel it — the leak that previously orphaned workers).
 * - **GPU-slot execution**: every load/inference op runs through the shared
 *   {@link GpuExecutor} slot with a crash-abort wired in, so a worker death
 *   releases the slot immediately instead of stalling it until the op timeout.
 * - **VRAM accounting + WASM promotion**: allocation tokens and the
 *   device-loss → wasm fallback decision.
 *
 * The host deliberately does NOT own the Eventa contract binding, per-op request
 * shapes, result encoding, UI status emission, or the adapter's request-level
 * error policy (caller-abort vs sentinel vs genuine failure). Adapters keep
 * those and call into the host for the resilience mechanics — see
 * `adapters/kokoro.ts` and `adapters/whisper.ts`.
 *
 * Scope: built for the device-loss-resilient models (kokoro, whisper). The
 * background-removal adapter has a simpler no-restart lifecycle and is not a
 * consumer yet.
 *
 * Call stack (per operation):
 *
 * adapter.loadModel / generate / transcribe
 *   -> {@link GpuWorkerHost.runExclusive}        (serialize ops on this worker)
 *     -> {@link GpuWorkerHost.runOnGpu}           (acquire shared GPU slot + crash-abort)
 *       -> {@link GpuExecutor.run}
 *         -> work({ slot, crashSignal })          (adapter's Eventa invoke)
 */

import type { GpuSlot } from './gpu-executor'
import type { AllocationToken } from './gpu-resource-coordinator'

import { Mutex } from 'async-mutex'

import { DEVICE_LOSS_WASM_THRESHOLD, MAX_RESTARTS, RESTART_DELAY_MS } from './constants'
import { getGPUCoordinator, getGpuExecutor } from './coordinator'
import { classifyDeviceLossReason, classifyError } from './protocol'

/**
 * Canonical lifecycle phase of a hosted worker. Adapters map this to their own
 * public state vocabulary (e.g. `'busy'` → `'running'` / `'transcribing'`).
 */
export type WorkerHostPhase = 'idle' | 'loading' | 'ready' | 'busy' | 'error' | 'terminated'

/** Adapter-driven phases (the host owns `'error'`, `'idle'`-on-respawn, `'terminated'`). */
export type AdapterPhase = 'idle' | 'loading' | 'ready' | 'busy' | 'error'

/** Work context handed to {@link GpuWorkerHost.runOnGpu}'s callback. */
export interface GpuWork {
  /** Cooperative preemption handle; streaming work yields between chunks. */
  slot: GpuSlot
  /**
   * Aborts when the worker dies (via `handleWorkerError`). OR this into the
   * Eventa invoke's `signal` so a crash ends the in-flight stream and frees the
   * GPU slot — a stream invoke does not reject on worker death on its own under
   * @moeru/eventa@1.0.0-beta.5.
   */
  crashSignal: AbortSignal
}

/**
 * Construction options for {@link createGpuWorkerHost}.
 *
 * @template Rpc - The shape returned by {@link GpuWorkerHostOptions.createRpc};
 *   the bound Eventa invoke clients the adapter calls.
 */
export interface GpuWorkerHostOptions<Rpc> {
  /**
   * Stable model id for device-loss telemetry. Pass a getter when it varies per
   * load (e.g. kokoro keys status by quantization); resolved at crash time.
   */
  modelId: string | (() => string)
  /** Spawn a fresh worker. Called lazily on first {@link GpuWorkerHost.ensure} and on each restart. */
  createWorker: () => Worker
  /** Bind the Eventa RPC clients to a freshly created worker. */
  createRpc: (worker: Worker) => Rpc
  /**
   * Run after teardown in {@link GpuWorkerHost.terminate}, for adapter-owned
   * cleanup the host doesn't know about (UI status removal, clearing handlers).
   */
  onTerminate?: () => void
}

/**
 * The resilient worker handle returned by {@link createGpuWorkerHost}.
 *
 * @template Rpc - The bound Eventa invoke clients (see {@link GpuWorkerHostOptions.createRpc}).
 */
export interface GpuWorkerHost<Rpc> {
  /** Current lifecycle phase — the single source of truth for the adapter's `state` getter. */
  readonly phase: WorkerHostPhase
  /** The bound RPC for the live worker, or null when not spawned / torn down. */
  readonly rpc: Rpc | null
  /** WebGPU device-loss events observed by this host. */
  readonly deviceLossCount: number

  /** Move to an adapter-driven phase. Crash/respawn/terminate phases are host-owned. */
  setPhase: (phase: AdapterPhase) => void

  /** Spawn the worker if needed and return its RPC, re-arming the crash guard for the fresh worker. */
  ensure: () => Rpc

  /**
   * Serialize an adapter operation (load or inference) against others on this
   * worker. A fatal worker error cancels any operation waiting on the lock.
   */
  runExclusive: <T>(fn: () => Promise<T>) => Promise<T>

  /**
   * Run GPU-bound work under the shared executor slot at `priority`, wiring a
   * crash-abort so a worker death releases the slot immediately.
   *
   * Use when:
   * - Dispatching any load or inference invoke that competes for the GPU.
   *
   * Expects:
   * - `work` performs the Eventa invoke and resolves when it completes; it must
   *   OR `crashSignal` into the invoke's `signal`. Streaming `work` may call
   *   `slot.yield()` between chunks to allow higher-priority preemption.
   *
   * Returns:
   * - `work`'s resolved value once the slot is granted (priority-ordered).
   */
  runOnGpu: <T>(
    execModelId: string,
    priority: number,
    callerSignal: AbortSignal | undefined,
    work: (ctx: GpuWork) => Promise<T>,
  ) => Promise<T>

  /**
   * Route a fatal worker error into crash recovery: record device-loss
   * telemetry, abort in-flight GPU work, tear the worker down, and reschedule a
   * respawn with backoff. Idempotent per worker death (the guard re-arms when a
   * fresh worker is created). Called by the native `'error'` listener and by the
   * adapter's operation catch for genuine (non-abort, non-request-level) failures.
   */
  handleWorkerError: (event: ErrorEvent | Error) => void

  /** Reset restart backoff after a successful operation. */
  recordSuccess: () => void

  /**
   * Promote a requested `'webgpu'` device to `'wasm'` once device-loss crosses
   * the threshold; any other request is returned unchanged. Generic so the
   * caller's literal device type is preserved at the call site.
   *
   * @template T - The requested device string literal.
   */
  promoteDevice: <T extends string>(requested: T) => T | 'wasm'

  /** Record/refresh the VRAM allocation for `modelId`, releasing any prior token. */
  allocate: (modelId: string, estimatedBytes: number) => void

  /** Mark the current allocation recently used (LRU ordering). */
  touch: () => void

  /** Tear down the worker, cancel a pending restart, release VRAM, and run `onTerminate`. */
  terminate: () => void
}

/**
 * Create a resilient GPU worker host. See the module doc for the responsibility
 * boundary between the host (resilience mechanics) and the adapter (contract +
 * per-op policy).
 *
 * @template Rpc - The bound Eventa invoke clients the adapter will call.
 */
export function createGpuWorkerHost<Rpc>(options: GpuWorkerHostOptions<Rpc>): GpuWorkerHost<Rpc> {
  const { createWorker, createRpc, onTerminate } = options
  const resolveModelId = (): string => (typeof options.modelId === 'function' ? options.modelId() : options.modelId)

  let worker: Worker | null = null
  let rpc: Rpc | null = null
  let phase: WorkerHostPhase = 'idle'
  let allocationToken: AllocationToken | null = null
  let restartAttempts = 0
  let deviceLossCount = 0
  let errorListener: ((event: ErrorEvent) => void) | null = null

  // NOTICE: Re-entrancy guard for handleWorkerError; a single worker death can
  // reach it from more than one path (the native 'error' listener and the
  // adapter's operation catch when the crash-aborted stream rejects). Without
  // it, one device loss would advance the restart counter and device-loss
  // accounting twice, hitting MAX_RESTARTS after half the real failures. Cleared
  // when a fresh worker is created (ensure), so the next crash is handled.
  let handlingError = false

  // NOTICE: Handle for the pending scheduleRestart() backoff timer so terminate()
  // can cancel it. Without this, terminating an 'error' host mid-backoff drops
  // the reference while the timer keeps ticking; it then respawns a Worker nobody
  // owns or tears down (a leaked worker + GPUDevice).
  let restartTimer: ReturnType<typeof setTimeout> | null = null

  // NOTICE: Aborts the in-flight GPU op on a fatal worker error. A stream invoke
  // does NOT reject on worker death under @moeru/eventa@1.0.0-beta.5 (only the
  // native 'error' listener fires), so without this a crash would hold the shared
  // executor slot until the op timeout elapsed, stalling all other GPU work.
  let inflightAbort: AbortController | null = null

  const operationMutex = new Mutex()

  function destroyWorker(): void {
    if (worker) {
      if (errorListener)
        worker.removeEventListener('error', errorListener)
      errorListener = null
      worker.terminate()
      worker = null
    }
    rpc = null
  }

  function scheduleRestart(): void {
    if (restartAttempts >= MAX_RESTARTS) {
      console.error(`[GpuWorkerHost:${resolveModelId()}] Max restart attempts (${MAX_RESTARTS}) reached.`)
      // Terminal: callers (e.g. a singleton accessor) detect the dead host and
      // recreate it. The worker was already torn down by handleWorkerError.
      phase = 'terminated'
      return
    }

    restartAttempts++
    const delay = RESTART_DELAY_MS * restartAttempts
    console.warn(`[GpuWorkerHost:${resolveModelId()}] Restarting in ${delay}ms (attempt ${restartAttempts}/${MAX_RESTARTS}).`)

    restartTimer = setTimeout(() => {
      restartTimer = null
      try {
        ensure()
        // Fresh worker, no model loaded yet: 'idle' invites the next load().
        // Adapters re-acquire the model lazily on their next op (see the
        // load-on-demand guards in generate/transcribe), so the host does not
        // reload here — recovery stays on-demand and never reloads a model the
        // caller has stopped using.
        phase = 'idle'
      }
      catch (error) {
        console.error(`[GpuWorkerHost:${resolveModelId()}] Restart failed:`, error)
      }
    }, delay)
  }

  function handleWorkerError(event: ErrorEvent | Error): void {
    if (handlingError)
      return
    handlingError = true

    phase = 'error'
    operationMutex.cancel()

    // Record device-loss telemetry before teardown so the coordinator sees it
    // even if the host is never used again.
    const error = event instanceof Error ? event : (event as ErrorEvent).error ?? event
    // Unblock any in-flight GPU op (see `inflightAbort`) so the shared executor
    // slot is released immediately rather than at the op timeout.
    inflightAbort?.abort(error instanceof Error ? error : new Error(String(error)))
    const code = classifyError(error)
    if (code === 'DEVICE_LOST') {
      deviceLossCount++
      getGPUCoordinator().recordDeviceLoss({
        modelId: resolveModelId(),
        reason: classifyDeviceLossReason(error),
        occurredAt: Date.now(),
      })
    }

    destroyWorker()
    scheduleRestart()
  }

  function ensure(): Rpc {
    if (!worker) {
      worker = createWorker()
      rpc = createRpc(worker)
      // Fresh worker lifecycle: re-arm the crash guard so the next death is handled.
      handlingError = false
      // NOTICE: Eventa also sets `worker.onerror` (rejecting in-flight unary
      // invokes); this native 'error' listener coexists with it and owns the
      // resilience policy, mirroring the pre-Eventa error listener.
      errorListener = (event: ErrorEvent) => handleWorkerError(event)
      worker.addEventListener('error', errorListener)
    }
    return rpc!
  }

  function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
    return operationMutex.runExclusive(fn)
  }

  function runOnGpu<T>(
    execModelId: string,
    priority: number,
    callerSignal: AbortSignal | undefined,
    work: (ctx: GpuWork) => Promise<T>,
  ): Promise<T> {
    const opAbort = new AbortController()
    inflightAbort = opAbort
    return getGpuExecutor()
      .run(execModelId, priority, slot => work({ slot, crashSignal: opAbort.signal }), { signal: callerSignal })
      .finally(() => {
        if (inflightAbort === opAbort)
          inflightAbort = null
      })
  }

  function recordSuccess(): void {
    restartAttempts = 0
  }

  function promoteDevice<T extends string>(requested: T): T | 'wasm' {
    if (requested === 'webgpu' && deviceLossCount >= DEVICE_LOSS_WASM_THRESHOLD) {
      console.warn(
        `[GpuWorkerHost:${resolveModelId()}] ${deviceLossCount} device-loss events recorded, `
        + `promoting load from webgpu to wasm.`,
      )
      return 'wasm'
    }
    return requested
  }

  function allocate(modelId: string, estimatedBytes: number): void {
    const coordinator = getGPUCoordinator()
    if (allocationToken)
      coordinator.release(allocationToken)
    allocationToken = coordinator.requestAllocation(modelId, estimatedBytes)
  }

  function touch(): void {
    if (allocationToken)
      getGPUCoordinator().touch(allocationToken.modelId)
  }

  function terminate(): void {
    if (restartTimer != null) {
      clearTimeout(restartTimer)
      restartTimer = null
    }
    operationMutex.cancel()
    destroyWorker()
    if (allocationToken) {
      getGPUCoordinator().release(allocationToken)
      allocationToken = null
    }
    phase = 'terminated'
    onTerminate?.()
  }

  return {
    get phase() { return phase },
    get rpc() { return rpc },
    get deviceLossCount() { return deviceLossCount },
    setPhase(next) { phase = next },
    ensure,
    runExclusive,
    runOnGpu,
    handleWorkerError,
    recordSuccess,
    promoteDevice,
    allocate,
    touch,
    terminate,
  }
}
