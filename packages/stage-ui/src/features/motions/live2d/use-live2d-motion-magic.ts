import type {
  OutputFilterFrame,
  OutputFilterOptions,
  Pose,
} from '@proj-airi/model-driver-magic-live2d'
import type { FitOptions, MagicModel } from '@proj-airi/motion-driver-magic'
import type { MaybeRefOrGetter } from 'vue'

import type { Live2DMotionMagicDataset } from './profiles'

import { errorMessageFrom } from '@moeru/std'
import {
  createDriver,
  createTrainingSequence,
  defaultOutputFilterOptions,
  neutralPose,
  poseAxes,
} from '@proj-airi/model-driver-magic-live2d'
import { fit } from '@proj-airi/motion-driver-magic'
import { computed, onScopeDispose, reactive, readonly, shallowRef, toValue, watch } from 'vue'

import { defaultLive2DMotionMagicDataset } from './profiles'
import { applyLive2DMotionViewTarget, defaultLive2DMotionViewTargetState } from './view-target'

export type Live2DMotionMagicMethod = 'ar-hmm' | 'var'
export type Live2DMotionMagicStatus = 'idle' | 'initializing' | 'playing' | 'ready'

/** Runtime boundaries for one MAGIC Live2D motion controller. */
export interface UseLive2DMotionMagicOptions {
  /** Supplies a dataset that replaces the bundled dataset. */
  dataset?: MaybeRefOrGetter<Live2DMotionMagicDataset | null | undefined>
  /** Prevents generated motion from controlling mouth opening. @default true */
  skipMouthOpen?: MaybeRefOrGetter<boolean>
  /** Keeps the generated eyes aimed at the forward view target. @default true */
  forceViewTarget?: MaybeRefOrGetter<boolean>
  /** Stops playback and initialization while another motion source owns the target. */
  disabled?: MaybeRefOrGetter<boolean>
  /** Receives the newest generated pose after filtering. */
  publishPose: (pose: Pose) => void
  /** Releases the generated pose when playback stops. */
  releasePose: () => void
  /** Reports playback ownership changes. */
  setPlaying?: (playing: boolean) => void
  /** Supplies fit timestamps in milliseconds. @default performance.now */
  now?: () => number
  /** Supplies values in the range [0, 1) for seed changes. @default Math.random */
  random?: () => number
}

function evaluateDataset(dataset: Live2DMotionMagicDataset, atMs: number): Pose {
  const time = Math.min(dataset.durationMs, Math.max(0, atMs))
  const rightIndex = dataset.samples.findIndex(sample => sample.atMs >= time)
  if (rightIndex <= 0) {
    const { atMs: _atMs, ...pose } = dataset.samples[rightIndex < 0 ? dataset.samples.length - 1 : 0]
    return pose
  }

  const left = dataset.samples[rightIndex - 1]
  const right = dataset.samples[rightIndex]
  const progress = left.atMs === right.atMs ? 1 : (time - left.atMs) / (right.atMs - left.atMs)
  const pose = { ...neutralPose }
  for (const axis of poseAxes)
    pose[axis] = left[axis] + (right[axis] - left[axis]) * progress
  return pose
}

function toTrainingSequence(dataset: Live2DMotionMagicDataset, sampleRateHz: number) {
  const frameIntervalMs = 1000 / sampleRateHz
  const frameCount = Math.floor(dataset.durationMs / frameIntervalMs) + 1
  return createTrainingSequence({
    sampleRateHz,
    sourceDurationMs: dataset.durationMs,
    poses: Array.from(
      { length: frameCount },
      (_, index) => evaluateDataset(dataset, Math.min(dataset.durationMs, index * frameIntervalMs)),
    ),
  })
}

/** Owns one MAGIC model, its Live2D driver, and its runtime diagnostics. */
export function useLive2DMotionMagic(options: UseLive2DMotionMagicOptions) {
  const now = options.now ?? (() => performance.now())
  const random = options.random ?? Math.random
  const method = shallowRef<Live2DMotionMagicMethod>('var')
  const status = shallowRef<Live2DMotionMagicStatus>('idle')
  const model = shallowRef<MagicModel>()
  const fitDurationMs = shallowRef(0)
  const error = shallowRef('')
  const generatedFrameCount = shallowRef(0)
  const currentState = shallowRef<number>()
  const seed = shallowRef(1)
  const outputFilterOptions = shallowRef<OutputFilterOptions>({ ...defaultOutputFilterOptions })
  const outputFilterFrame = shallowRef<OutputFilterFrame>()
  const varSettings = reactive({
    order: 20,
    noiseScale: 1.15,
  })
  const arHmmSettings = reactive({
    stateCount: 5,
    order: 12,
    noiseScale: 0.8,
  })
  let initializeRequest = 0

  const driver = createDriver<number | undefined>({
    target: {
      apply: pose => options.publishPose(toValue(options.forceViewTarget ?? true)
        ? applyLive2DMotionViewTarget(pose, defaultLive2DMotionViewTargetState)
        : pose),
      release: options.releasePose,
    },
    generateOptions: () => ({ noiseScale: getNoiseScale() }),
    onGenerate: (state) => {
      generatedFrameCount.value++
      currentState.value = state
    },
    onOutput: (frame) => {
      outputFilterFrame.value = frame
    },
    skipMouthOpen: () => toValue(options.skipMouthOpen ?? true),
    filterOptions: outputFilterOptions.value,
  })

  const playing = computed(() => status.value === 'playing')
  const generatedDurationSeconds = computed(() => {
    if (!model.value)
      return 0
    return generatedFrameCount.value / model.value.sampleRateHz
  })

  function getNoiseScale(): number {
    return method.value === 'var' ? varSettings.noiseScale : arHmmSettings.noiseScale
  }

  function stop() {
    if (status.value === 'initializing') {
      initializeRequest++
      status.value = model.value ? 'ready' : 'idle'
      return
    }

    if (status.value !== 'playing')
      return

    driver.stop()
    currentState.value = undefined
    status.value = model.value ? 'ready' : 'idle'
    options.setPlaying?.(false)
  }

  function invalidate() {
    initializeRequest++
    stop()
    model.value = undefined
    fitDurationMs.value = 0
    error.value = ''
    generatedFrameCount.value = 0
    status.value = 'idle'
  }

  /** Fits the selected method with the supplied dataset or the bundled dataset. */
  async function initialize(dataset = toValue(options.dataset) ?? defaultLive2DMotionMagicDataset): Promise<void> {
    if (toValue(options.disabled ?? false))
      return

    stop()
    const request = ++initializeRequest
    const startedAt = now()
    status.value = 'initializing'
    error.value = ''

    await Promise.resolve()
    if (request !== initializeRequest)
      return

    try {
      const fitOptions: FitOptions = method.value === 'var'
        ? {
            method: 'var',
            order: varSettings.order,
            ridge: 0.001,
          }
        : {
            method: 'ar-hmm',
            stateCount: arHmmSettings.stateCount,
            order: arHmmSettings.order,
            ridge: 0.003,
            iterations: 6,
          }
      const nextModel = fit(toTrainingSequence(dataset, 30), fitOptions)
      if (request !== initializeRequest)
        return

      model.value = nextModel
      fitDurationMs.value = now() - startedAt
      generatedFrameCount.value = 0
      currentState.value = undefined
      status.value = 'ready'
    }
    catch (cause) {
      if (request !== initializeRequest)
        return

      console.error(`[Live2D ${method.value}] Failed to initialize MAGIC motion`, errorMessageFrom(cause))
      model.value = undefined
      fitDurationMs.value = 0
      error.value = errorMessageFrom(cause) ?? 'The MAGIC motion model failed to initialize.'
      status.value = 'idle'
    }
  }

  function start() {
    if (!model.value || status.value === 'playing' || toValue(options.disabled ?? false))
      return

    generatedFrameCount.value = 0
    currentState.value = undefined
    status.value = 'playing'
    options.setPlaying?.(true)
    driver.start(model.value.toGenerator({ seed: seed.value }))
  }

  function randomizeSeed() {
    seed.value = Math.floor(random() * 0x1_0000_0000) >>> 0
    if (status.value !== 'playing' || !model.value)
      return

    generatedFrameCount.value = 0
    currentState.value = undefined
    driver.replace(model.value.toGenerator({ seed: seed.value }))
  }

  function setOutputFilterOptions(nextOptions: OutputFilterOptions) {
    outputFilterOptions.value = nextOptions
    driver.setFilterOptions(nextOptions)
  }

  function resetOutputFilter() {
    driver.resetFilter()
  }

  watch(() => toValue(options.dataset), invalidate)
  watch(() => toValue(options.disabled ?? false), (disabled) => {
    if (disabled)
      invalidate()
  })
  watch(method, invalidate)
  watch(
    [() => varSettings.order, () => arHmmSettings.stateCount, () => arHmmSettings.order],
    invalidate,
  )
  onScopeDispose(() => {
    initializeRequest++
    stop()
  })

  return {
    method,
    status: readonly(status),
    playing,
    model: readonly(model),
    fitDurationMs: readonly(fitDurationMs),
    error: readonly(error),
    generatedFrameCount: readonly(generatedFrameCount),
    generatedDurationSeconds,
    currentState: readonly(currentState),
    seed: readonly(seed),
    varSettings,
    arHmmSettings,
    outputFilterOptions: readonly(outputFilterOptions),
    outputFilterFrame: readonly(outputFilterFrame),
    initialize,
    start,
    stop,
    randomizeSeed,
    setOutputFilterOptions,
    resetOutputFilter,
  }
}
