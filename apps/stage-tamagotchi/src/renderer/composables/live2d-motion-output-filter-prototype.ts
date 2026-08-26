import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

const poseTrackIds = [
  'eyeX',
  'eyeY',
  'eyeSquint',
  'headX',
  'headY',
  'headZ',
  'bodyX',
  'bodyY',
  'bodyZ',
  'mouthForm',
  'mouthOpen',
  'offsetX',
  'offsetY',
] as const satisfies readonly (keyof Live2DMotionControlPose)[]

/** Controls the experimental generator output filter. */
export interface Live2DMotionOutputFilterOptions {
  /** Applies the cutoff and EMA stages to generated poses. @default true */
  enabled: boolean
  /** Weight of the previous output from 0 (raw) to 0.999 (slow). @default 0.8 */
  smoothing: number
  /** Smallest normalized change that updates a channel target. @default 0.015 */
  cutoff: number
}

/** One processed generator frame and the diagnostics shown by the devtool. */
export interface Live2DMotionOutputFilterFrame {
  /** Raw pose emitted by VAR or AR-HMM. */
  inputPose: Live2DMotionControlPose
  /** Pose sent to eye fixation and then the shared spring. */
  pose: Live2DMotionControlPose
  /** Mean absolute channel change in the raw generator output. */
  inputChangeMeanAbsolute: number
  /** Mean absolute channel change after cutoff and EMA smoothing. */
  outputChangeMeanAbsolute: number
  /** Number of changed channels held below the cutoff. */
  cutoffTrackCount: number
}

/** A stateful cutoff and EMA processor for fixed-rate generator poses. */
export interface Live2DMotionOutputFilterController {
  /** Processes one generated pose and advances the filter state. */
  process: (pose: Live2DMotionControlPose) => Live2DMotionOutputFilterFrame
  /** Clears accepted targets and EMA history before another generated run. */
  reset: () => void
  /** Changes filter controls without replacing the active processor. */
  setOptions: (options: Live2DMotionOutputFilterOptions) => void
}

export const defaultLive2DMotionOutputFilterOptions: Readonly<Live2DMotionOutputFilterOptions> = Object.freeze({
  enabled: true,
  smoothing: 0.8,
  cutoff: 0.015,
})

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function normalizeOptions(options: Live2DMotionOutputFilterOptions): Live2DMotionOutputFilterOptions {
  return {
    enabled: options.enabled,
    smoothing: clamp(options.smoothing, 0, 0.999),
    cutoff: clamp(options.cutoff, 0, 1),
  }
}

function meanAbsoluteDifference(left: Live2DMotionControlPose, right: Live2DMotionControlPose): number {
  const total = poseTrackIds.reduce((sum, trackId) => sum + Math.abs(left[trackId] - right[trackId]), 0)
  return total / poseTrackIds.length
}

/** Creates the experimental generator output filter used by the motion devtool. */
export function createLive2DMotionOutputFilter(
  initialOptions: Live2DMotionOutputFilterOptions = defaultLive2DMotionOutputFilterOptions,
): Live2DMotionOutputFilterController {
  let options = normalizeOptions(initialOptions)
  let previousInput: Live2DMotionControlPose | undefined
  let acceptedPose: Live2DMotionControlPose | undefined
  let outputPose: Live2DMotionControlPose | undefined

  function reset() {
    previousInput = undefined
    acceptedPose = undefined
    outputPose = undefined
  }

  function setOptions(nextOptions: Live2DMotionOutputFilterOptions) {
    const normalizedOptions = normalizeOptions(nextOptions)
    if (normalizedOptions.enabled !== options.enabled)
      reset()
    options = normalizedOptions
  }

  function process(input: Live2DMotionControlPose): Live2DMotionOutputFilterFrame {
    const inputPose = { ...input }
    if (!previousInput || !acceptedPose || !outputPose) {
      previousInput = inputPose
      acceptedPose = inputPose
      outputPose = inputPose
      return {
        inputPose,
        pose: inputPose,
        inputChangeMeanAbsolute: 0,
        outputChangeMeanAbsolute: 0,
        cutoffTrackCount: 0,
      }
    }

    const previousOutput = outputPose
    const inputChangeMeanAbsolute = meanAbsoluteDifference(inputPose, previousInput)
    previousInput = inputPose

    if (!options.enabled) {
      acceptedPose = inputPose
      outputPose = inputPose
      return {
        inputPose,
        pose: inputPose,
        inputChangeMeanAbsolute,
        outputChangeMeanAbsolute: meanAbsoluteDifference(inputPose, previousOutput),
        cutoffTrackCount: 0,
      }
    }

    const nextAcceptedPose = { ...acceptedPose }
    const nextOutputPose = { ...outputPose }
    let cutoffTrackCount = 0

    for (const trackId of poseTrackIds) {
      const changeFromAccepted = Math.abs(inputPose[trackId] - acceptedPose[trackId])
      if (changeFromAccepted >= options.cutoff)
        nextAcceptedPose[trackId] = inputPose[trackId]
      else if (changeFromAccepted > 0)
        cutoffTrackCount++

      nextOutputPose[trackId]
        = outputPose[trackId] * options.smoothing
          + nextAcceptedPose[trackId] * (1 - options.smoothing)
    }

    acceptedPose = nextAcceptedPose
    outputPose = nextOutputPose
    return {
      inputPose,
      pose: nextOutputPose,
      inputChangeMeanAbsolute,
      outputChangeMeanAbsolute: meanAbsoluteDifference(nextOutputPose, previousOutput),
      cutoffTrackCount,
    }
  }

  return { process, reset, setOptions }
}
