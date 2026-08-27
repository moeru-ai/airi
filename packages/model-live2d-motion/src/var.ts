import type {
  Live2DMotionPose,
  Live2DMotionPredictOptions,
  Live2DMotionPredictor,
  Live2DMotionPredictorOptions,
  Live2DMotionTrainingSequence,
} from './index'
import type { Live2DMotionChannel } from './internal/pose-channels'

import { createAutoregressiveFeature, predictAutoregressiveValues, solvePositiveDefinite } from './internal/numeric'
import { createBaselinePose, createMotionChannels, poseFromChannels } from './internal/pose-channels'
import { createSeededRandom } from './internal/random'

/** One varying motion channel and every exact duplicate track that shares it. */
export type Live2DMotionVarChannel = Live2DMotionChannel

/** The fit controls for the experimental Live2D VAR generator. */
export interface Live2DMotionVarOptions {
  /** Number of fixed-rate history frames in each prediction. */
  order: number
  /** Ridge penalty relative to the number of training rows. */
  ridge: number
}

/** A fitted experimental VAR model and the diagnostics shown by the devtool. */
export interface Live2DMotionVarModel {
  /** Controls that produced this fit. */
  options: Live2DMotionVarOptions
  /** Training and generation cadence in frames per second. */
  sampleRateHz: number
  /** Duration of the source motion before fixed-rate resampling. */
  sourceDurationMs: number
  /** Number of fixed-rate source frames used by the fit. */
  sourceFrameCount: number
  /** Number of varying, non-duplicate pose channels. */
  channelCount: number
  /** Number of intercept and lag terms in each channel equation. */
  featureCount: number
  /** Root mean square of the normalized one-step fit residuals. */
  residualRootMeanSquare: number
  /** Channel mappings and source scale statistics. */
  channels: Live2DMotionVarChannel[]
  /** Ridge-regularized coefficients, indexed by feature and output channel. */
  coefficients: number[][]
  /** Correlated one-step errors available for generation-time sampling. */
  residuals: number[][]
  /** Normalized source frames available for seeded history selection. */
  trainingFrames: number[][]
  /** Mean source pose, including constant tracks. */
  baselinePose: Live2DMotionPose
}

function fitCoefficients(frames: readonly number[][], options: Live2DMotionVarOptions): number[][] {
  const channelCount = frames[0].length
  const featureCount = 1 + options.order * channelCount
  const gram = Array.from({ length: featureCount }, () => Array.from<number>({ length: featureCount }).fill(0))
  const cross = Array.from({ length: featureCount }, () => Array.from<number>({ length: channelCount }).fill(0))

  for (let frameIndex = options.order; frameIndex < frames.length; frameIndex++) {
    const feature = createAutoregressiveFeature(frames, options.order, channelCount, frameIndex)
    const target = frames[frameIndex]
    for (let row = 0; row < featureCount; row++) {
      for (let column = 0; column <= row; column++)
        gram[row][column] += feature[row] * feature[column]
      for (let output = 0; output < channelCount; output++)
        cross[row][output] += feature[row] * target[output]
    }
  }

  for (let row = 0; row < featureCount; row++) {
    for (let column = 0; column < row; column++)
      gram[column][row] = gram[row][column]
  }
  const trainingRowCount = frames.length - options.order
  for (let index = 1; index < featureCount; index++)
    gram[index][index] += options.ridge * trainingRowCount

  return solvePositiveDefinite(gram, cross, 'The VAR fit is numerically singular. Increase the ridge penalty.')
}

function createResiduals(frames: readonly number[][], coefficients: readonly number[][], order: number): number[][] {
  const channelCount = frames[0].length
  const residuals: number[][] = []
  for (let frameIndex = order; frameIndex < frames.length; frameIndex++) {
    const feature = createAutoregressiveFeature(frames, order, channelCount, frameIndex)
    const prediction = predictAutoregressiveValues(coefficients, feature)
    residuals.push(frames[frameIndex].map((value, channel) => value - prediction[channel]))
  }
  return residuals
}

/**
 * Fits a ridge-regularized VAR to a fixed-rate motion sequence.
 *
 * Exact duplicate tracks share one channel. Constant tracks keep their source mean.
 */
export function fitVarMotionModel(
  sequence: Live2DMotionTrainingSequence,
  options: Live2DMotionVarOptions,
): Live2DMotionVarModel {
  if (!Number.isFinite(sequence.sampleRateHz) || sequence.sampleRateHz <= 0)
    throw new Error('The motion sample rate must be positive.')
  if (options.order < 1 || !Number.isInteger(options.order))
    throw new Error('The VAR order must be a positive integer.')

  const poses = sequence.poses
  const channels = createMotionChannels(poses)
  if (channels.length === 0)
    throw new Error('The current motion has no changing channels.')
  if (poses.length <= options.order + 1)
    throw new Error('The current motion is too short for this VAR order.')

  const baselinePose = createBaselinePose(poses)
  const trainingFrames = poses.map(pose => channels.map(channel => (pose[channel.trackIds[0]] - channel.mean) / channel.scale))
  const coefficients = fitCoefficients(trainingFrames, options)
  const residuals = createResiduals(trainingFrames, coefficients, options.order)
  const squaredResidualSum = residuals.reduce(
    (sum, residual) => sum + residual.reduce((channelSum, value) => channelSum + value ** 2, 0),
    0,
  )

  return {
    options,
    sampleRateHz: sequence.sampleRateHz,
    sourceDurationMs: sequence.sourceDurationMs,
    sourceFrameCount: poses.length,
    channelCount: channels.length,
    featureCount: coefficients.length,
    residualRootMeanSquare: Math.sqrt(squaredResidualSum / (residuals.length * channels.length)),
    channels,
    coefficients,
    residuals,
    trainingFrames,
    baselinePose,
  }
}

/** Creates a seeded, residual-driven predictor from a fitted VAR model. */
export function createVarMotionPredictor(
  model: Live2DMotionVarModel,
  options: Live2DMotionPredictorOptions,
): Live2DMotionPredictor {
  const random = createSeededRandom(options.seed)
  const maximumStart = model.trainingFrames.length - model.options.order
  const start = Math.floor(random() * maximumStart)
  const history = model.trainingFrames
    .slice(start, start + model.options.order)
    .map(frame => [...frame])

  function next(predictOptions?: Live2DMotionPredictOptions) {
    const noiseScale = predictOptions?.noiseScale ?? 1
    const feature = createAutoregressiveFeature(history, model.options.order, model.channelCount)
    const prediction = predictAutoregressiveValues(model.coefficients, feature)
    const residual = model.residuals[Math.floor(random() * model.residuals.length)]
    const nextFrame = prediction.map((value, channelIndex) => {
      const channel = model.channels[channelIndex]
      const rawValue = channel.mean + (value + residual[channelIndex] * noiseScale) * channel.scale
      const clampedValue = Math.min(channel.maximum, Math.max(channel.minimum, rawValue))
      return (clampedValue - channel.mean) / channel.scale
    })
    history.shift()
    history.push(nextFrame)
    return {
      pose: poseFromChannels(model.baselinePose, model.channels, nextFrame),
      state: undefined,
    }
  }

  return { sampleRateHz: model.sampleRateHz, next }
}
