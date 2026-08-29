import type { GenerateOptions, Generator } from '@proj-airi/motion-driver-magic'

import type { OutputFilterFrame, OutputFilterOptions } from './filter'
import type { Pose } from './pose'

import { createOutputFilter, defaultOutputFilterOptions } from './filter'
import { neutralPose, poseFromValues } from './pose'

/** Receives generated poses and releases ownership when playback stops. */
export interface Target {
  apply: (pose: Pose) => void
  release: () => void
}

/** Runtime interfaces for one MAGIC Live2D driver. */
export interface DriverOptions<TState> {
  target: Target
  /** Supplies controls that can change between generated frames. */
  generateOptions?: () => GenerateOptions
  /** Receives every generated model state, including catch-up frames. */
  onGenerate?: (state: TState) => void
  /** Receives the newest processed output, or `undefined` after reset. */
  onOutput?: (frame: OutputFilterFrame | undefined) => void
  /** Sets generated mouth opening to neutral before output. @default true */
  skipMouthOpen?: () => boolean
  /** Supplies a monotonic timestamp in milliseconds. @default performance.now */
  now?: () => number
  /** Schedules the next display update. @default requestAnimationFrame */
  requestFrame?: (callback: FrameRequestCallback) => number
  /** Cancels a scheduled display update. @default cancelAnimationFrame */
  cancelFrame?: (handle: number) => void
  /** Supplies the first output-filter controls. */
  filterOptions?: OutputFilterOptions
}

/** Owns fixed-rate generation and one Live2D target lifecycle. */
export interface Driver<TState> {
  readonly playing: boolean
  /** Starts a stopped driver and applies the first generated pose immediately. */
  start: (generator: Generator<TState>) => void
  /** Replaces the active generator without releasing the target. */
  replace: (generator: Generator<TState>) => void
  /** Stops generation and releases the target. */
  stop: () => void
  /** Changes output-filter controls without replacing the driver. */
  setFilterOptions: (options: OutputFilterOptions) => void
  /** Clears filter history and reapplies the latest raw pose. */
  resetFilter: () => void
  /** Stops generation and releases runtime resources. */
  dispose: () => void
}

/** Creates a MAGIC driver for one Live2D target. */
export function createDriver<TState>(options: DriverOptions<TState>): Driver<TState> {
  const now = options.now ?? (() => performance.now())
  const requestFrame = options.requestFrame ?? (callback => requestAnimationFrame(callback))
  const cancelFrame = options.cancelFrame ?? (handle => cancelAnimationFrame(handle))
  const filter = createOutputFilter(options.filterOptions ?? defaultOutputFilterOptions)

  let generator: Generator<TState> | undefined
  let animationFrame: number | undefined
  let lastFrameAt = 0
  let accumulatedMs = 0
  let outputFrame: OutputFilterFrame | undefined

  function generatePose(): Pose {
    const frame = generator!.next(options.generateOptions?.())
    options.onGenerate?.(frame.state)
    return poseFromValues(frame.values)
  }

  function applyPose(pose: Pose) {
    const filteredFrame = filter.process(pose)
    outputFrame = (options.skipMouthOpen?.() ?? true)
      ? {
          ...filteredFrame,
          pose: {
            ...filteredFrame.pose,
            mouthOpen: neutralPose.mouthOpen,
          },
        }
      : filteredFrame
    options.onOutput?.(outputFrame)
    options.target.apply(outputFrame.pose)
  }

  function generationFrame(timestamp: number) {
    if (!generator)
      return

    const frameIntervalMs = 1000 / generator.sampleRateHz
    accumulatedMs += Math.min(250, Math.max(0, timestamp - lastFrameAt))
    lastFrameAt = timestamp

    let nextPose: Pose | undefined
    while (accumulatedMs >= frameIntervalMs) {
      nextPose = generatePose()
      accumulatedMs -= frameIntervalMs
    }
    if (nextPose)
      applyPose(nextPose)

    animationFrame = requestFrame(generationFrame)
  }

  function start(nextGenerator: Generator<TState>) {
    if (generator)
      throw new Error('The MAGIC Live2D driver is already playing.')

    generator = nextGenerator
    accumulatedMs = 0
    lastFrameAt = now()
    filter.reset()
    outputFrame = undefined
    options.onOutput?.(undefined)
    applyPose(generatePose())
    animationFrame = requestFrame(generationFrame)
  }

  function replace(nextGenerator: Generator<TState>) {
    if (!generator)
      throw new Error('The MAGIC Live2D driver is not playing.')

    generator = nextGenerator
    accumulatedMs = 0
    lastFrameAt = now()
  }

  function stop() {
    if (!generator)
      return

    if (animationFrame !== undefined)
      cancelFrame(animationFrame)
    generator = undefined
    animationFrame = undefined
    accumulatedMs = 0
    filter.reset()
    outputFrame = undefined
    options.onOutput?.(undefined)
    options.target.release()
  }

  function setFilterOptions(filterOptions: OutputFilterOptions) {
    filter.setOptions(filterOptions)
  }

  function resetFilter() {
    const inputPose = outputFrame?.inputPose
    filter.reset()
    outputFrame = undefined
    options.onOutput?.(undefined)
    if (generator && inputPose)
      applyPose(inputPose)
  }

  return {
    get playing() {
      return generator !== undefined
    },
    start,
    replace,
    stop,
    setFilterOptions,
    resetFilter,
    dispose: stop,
  }
}
