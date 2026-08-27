import type {
  Live2DMotionPose,
  Live2DMotionPrediction,
  Live2DMotionPredictOptions,
} from '@proj-airi/model-live2d-motion'
import type { Live2DMotionArHmmModel } from '@proj-airi/model-live2d-motion/ar-hmm'
import type { Live2DMotionVarModel } from '@proj-airi/model-live2d-motion/var'
import type { MaybeRefOrGetter } from 'vue'

import type { ReadonlyLive2DMotionRecording } from './live2d-motion-recording'

import { errorMessageFrom } from '@moeru/std'
import { computed, onScopeDispose, reactive, readonly, shallowRef, toValue, watch } from 'vue'

import { createLive2DMotionTrainingSequence } from './live2d-motion-training-sequence'

export type Live2DProceduralMotionKind = 'ar-hmm' | 'var'
export type Live2DProceduralMotionStatus = 'fitting' | 'idle' | 'playing' | 'ready'

interface ProceduralMotionPredictor {
  sampleRateHz: number
  next: (options?: Live2DMotionPredictOptions) => Live2DMotionPrediction<number | undefined>
}

type FittedProceduralMotion
  = | {
    kind: 'var'
    model: Live2DMotionVarModel
    createPredictor: (seed: number) => ProceduralMotionPredictor
  }
  | {
    kind: 'ar-hmm'
    model: Live2DMotionArHmmModel
    createPredictor: (seed: number) => ProceduralMotionPredictor
  }

/** Runtime boundaries for generated Live2D motion. */
export interface UseLive2DProceduralMotionOptions {
  /** Recording that supplies model training data. */
  recording: MaybeRefOrGetter<ReadonlyLive2DMotionRecording | null | undefined>
  /** Stops generation while another motion source owns the target. */
  disabled?: MaybeRefOrGetter<boolean>
  /** Receives the newest generated pose after each fixed-rate model step. */
  publishPose: (pose: Live2DMotionPose) => void
  /** Releases the generated pose when playback stops. */
  releasePose: () => void
  /** Reports changes to the shared playback owner. */
  setPlaying?: (playing: boolean) => void
}

/**
 * Owns model loading, fitting, seeded prediction, and fixed-rate scheduling.
 *
 * The composable loads only the selected model entry point. It publishes the
 * newest prediction once per display frame when the model catches up.
 */
export function useLive2DProceduralMotion(options: UseLive2DProceduralMotionOptions) {
  const kind = shallowRef<Live2DProceduralMotionKind>('var')
  const status = shallowRef<Live2DProceduralMotionStatus>('idle')
  const fitted = shallowRef<FittedProceduralMotion>()
  const fitDurationMs = shallowRef(0)
  const fitError = shallowRef('')
  const generatedFrameCount = shallowRef(0)
  const currentState = shallowRef<number>()
  const seed = shallowRef(1)
  const varSettings = reactive({
    order: 20,
    noiseScale: 1.15,
  })
  const arHmmSettings = reactive({
    stateCount: 5,
    order: 12,
    noiseScale: 0.8,
  })

  let predictor: ProceduralMotionPredictor | undefined
  let animationFrame: number | undefined
  let lastFrameAt = 0
  let accumulatedMs = 0
  let fitRequest = 0

  const playing = computed(() => status.value === 'playing')
  const generatedDurationSeconds = computed(() => {
    const sampleRateHz = getSampleRateHz()
    if (sampleRateHz === 0)
      return 0
    return generatedFrameCount.value / sampleRateHz
  })

  function getSampleRateHz(): number {
    if (!fitted.value)
      return 0
    return fitted.value.kind === 'var'
      ? fitted.value.model.sampleRateHz
      : fitted.value.model.sourceModel.sampleRateHz
  }

  function getNoiseScale(): number {
    return kind.value === 'var' ? varSettings.noiseScale : arHmmSettings.noiseScale
  }

  function stop() {
    if (animationFrame !== undefined)
      cancelAnimationFrame(animationFrame)
    animationFrame = undefined
    predictor = undefined
    currentState.value = undefined

    if (status.value !== 'playing')
      return

    status.value = fitted.value ? 'ready' : 'idle'
    options.setPlaying?.(false)
    options.releasePose()
  }

  function invalidate() {
    fitRequest++
    stop()
    fitted.value = undefined
    fitDurationMs.value = 0
    fitError.value = ''
    generatedFrameCount.value = 0
    status.value = 'idle'
  }

  async function fit() {
    const recording = toValue(options.recording)
    if (!recording || toValue(options.disabled ?? false))
      return

    stop()
    const request = ++fitRequest
    const startedAt = performance.now()
    status.value = 'fitting'
    fitError.value = ''

    try {
      const sequence = createLive2DMotionTrainingSequence(recording, 30)
      if (kind.value === 'var') {
        const module = await import('@proj-airi/model-live2d-motion/var')
        const model = module.fitVarMotionModel(sequence, {
          order: varSettings.order,
          ridge: 0.001,
        })
        if (request !== fitRequest)
          return

        fitted.value = {
          kind: 'var',
          model,
          createPredictor: predictorSeed => module.createVarMotionPredictor(model, { seed: predictorSeed }),
        }
      }
      else {
        const module = await import('@proj-airi/model-live2d-motion/ar-hmm')
        const model = module.fitArHmmMotionModel(sequence, {
          stateCount: arHmmSettings.stateCount,
          order: arHmmSettings.order,
          ridge: 0.003,
          iterations: 6,
        })
        if (request !== fitRequest)
          return

        fitted.value = {
          kind: 'ar-hmm',
          model,
          createPredictor: predictorSeed => module.createArHmmMotionPredictor(model, { seed: predictorSeed }),
        }
      }

      fitDurationMs.value = performance.now() - startedAt
      generatedFrameCount.value = 0
      currentState.value = undefined
      status.value = 'ready'
    }
    catch (error) {
      if (request !== fitRequest)
        return

      console.error(`[Live2D ${kind.value}] Failed to fit motion`, errorMessageFrom(error))
      fitted.value = undefined
      fitDurationMs.value = 0
      fitError.value = errorMessageFrom(error) ?? 'The motion model fit failed.'
      status.value = 'idle'
    }
  }

  function publishNextPose() {
    if (!predictor)
      return

    const frame = predictor.next({ noiseScale: getNoiseScale() })
    generatedFrameCount.value++
    currentState.value = frame.state
    options.publishPose(frame.pose)
  }

  function generationFrame(now: number) {
    if (status.value !== 'playing' || !predictor)
      return

    const frameIntervalMs = 1000 / predictor.sampleRateHz
    accumulatedMs += Math.min(250, Math.max(0, now - lastFrameAt))
    lastFrameAt = now

    let nextFrame: Live2DMotionPrediction<number | undefined> | undefined
    while (accumulatedMs >= frameIntervalMs) {
      nextFrame = predictor.next({ noiseScale: getNoiseScale() })
      generatedFrameCount.value++
      accumulatedMs -= frameIntervalMs
    }
    if (nextFrame) {
      currentState.value = nextFrame.state
      options.publishPose(nextFrame.pose)
    }

    animationFrame = requestAnimationFrame(generationFrame)
  }

  function start() {
    if (!fitted.value || status.value === 'playing' || toValue(options.disabled ?? false))
      return

    predictor = fitted.value.createPredictor(seed.value)
    generatedFrameCount.value = 0
    currentState.value = undefined
    accumulatedMs = 0
    lastFrameAt = performance.now()
    status.value = 'playing'
    options.setPlaying?.(true)
    publishNextPose()
    animationFrame = requestAnimationFrame(generationFrame)
  }

  function useNewSeed() {
    seed.value = crypto.getRandomValues(new Uint32Array(1))[0]
    if (status.value !== 'playing' || !fitted.value)
      return

    predictor = fitted.value.createPredictor(seed.value)
    generatedFrameCount.value = 0
    currentState.value = undefined
    accumulatedMs = 0
    lastFrameAt = performance.now()
  }

  watch(() => toValue(options.recording), invalidate)
  watch(() => toValue(options.disabled ?? false), (disabled) => {
    if (disabled)
      stop()
  })
  watch(kind, invalidate)
  watch(
    [() => varSettings.order, () => arHmmSettings.stateCount, () => arHmmSettings.order],
    invalidate,
  )
  onScopeDispose(() => {
    fitRequest++
    stop()
  })

  return {
    kind,
    status: readonly(status),
    playing,
    fitted: readonly(fitted),
    fitDurationMs: readonly(fitDurationMs),
    fitError: readonly(fitError),
    generatedFrameCount: readonly(generatedFrameCount),
    generatedDurationSeconds,
    currentState: readonly(currentState),
    seed: readonly(seed),
    varSettings,
    arHmmSettings,
    fit,
    start,
    stop,
    useNewSeed,
  }
}
