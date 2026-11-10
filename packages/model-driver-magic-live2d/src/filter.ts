import type { Pose } from './pose'

import { clamp } from 'es-toolkit/math'

import { poseAxes } from './pose'

/** Controls the generated-pose output filter. */
export interface OutputFilterOptions {
  /** Applies the cutoff and EMA stages to generated poses. @default true */
  enabled: boolean
  /** Weight of the previous output from 0 (raw) to 0.999 (slow). @default 0.8 */
  smoothing: number
  /** Smallest normalized change that updates a channel target. @default 0.0575 */
  cutoff: number
}

/** One processed generator frame and its filter diagnostics. */
export interface OutputFilterFrame {
  /** Raw pose emitted by VAR or AR-HMM. */
  inputPose: Pose
  /** Pose sent to the Live2D target. */
  pose: Pose
  /** Mean absolute channel change in the raw generator output. */
  inputChangeMeanAbsolute: number
  /** Mean absolute channel change after cutoff and EMA smoothing. */
  outputChangeMeanAbsolute: number
  /** Number of changed channels held below the cutoff. */
  cutoffTrackCount: number
}

/** A stateful cutoff and EMA processor for fixed-rate generator poses. */
export interface OutputFilter {
  /** Processes one generated pose and advances the filter state. */
  process: (pose: Pose) => OutputFilterFrame
  /** Clears accepted targets and EMA history before another generated run. */
  reset: () => void
  /** Changes filter controls without replacing the active processor. */
  setOptions: (options: OutputFilterOptions) => void
}

/** Tuned controls used when a driver does not supply filter options. */
export const defaultOutputFilterOptions: Readonly<OutputFilterOptions> = Object.freeze({
  enabled: true,
  smoothing: 0.8,
  cutoff: 0.0575,
})

function normalizeOptions(options: OutputFilterOptions): OutputFilterOptions {
  return {
    enabled: options.enabled,
    smoothing: clamp(options.smoothing, 0, 0.999),
    cutoff: clamp(options.cutoff, 0, 1),
  }
}

function meanAbsoluteDifference(left: Pose, right: Pose): number {
  const total = poseAxes.reduce((sum, axis) => sum + Math.abs(left[axis] - right[axis]), 0)
  return total / poseAxes.length
}

/** Creates one generated-pose output filter. */
export function createOutputFilter(
  initialOptions: OutputFilterOptions = defaultOutputFilterOptions,
): OutputFilter {
  let options = normalizeOptions(initialOptions)
  let previousInput: Pose | undefined
  let acceptedPose: Pose | undefined
  let outputPose: Pose | undefined

  function reset() {
    previousInput = undefined
    acceptedPose = undefined
    outputPose = undefined
  }

  function setOptions(nextOptions: OutputFilterOptions) {
    const normalizedOptions = normalizeOptions(nextOptions)
    if (normalizedOptions.enabled !== options.enabled)
      reset()
    options = normalizedOptions
  }

  function process(input: Pose): OutputFilterFrame {
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

    for (const axis of poseAxes) {
      const changeFromAccepted = Math.abs(inputPose[axis] - acceptedPose[axis])
      if (changeFromAccepted >= options.cutoff)
        nextAcceptedPose[axis] = inputPose[axis]
      else if (changeFromAccepted > 0)
        cutoffTrackCount++

      nextOutputPose[axis]
        = outputPose[axis] * options.smoothing
          + nextAcceptedPose[axis] * (1 - options.smoothing)
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
