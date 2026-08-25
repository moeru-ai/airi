import type { Live2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import type { ReadonlyLive2DMotionRecording } from './live2d-motion-recording'

import { neutralLive2DMotionControlPose } from '@proj-airi/stage-ui-live2d/stores'

import { evaluateLive2DMotionRecording } from './live2d-motion-keyframes'

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

/** A normalized pose track that can participate in autoregressive fitting. */
export type PoseTrackId = typeof poseTrackIds[number]

/** One varying motion channel and every exact duplicate track that shares it. */
export interface Live2DMotionVarChannel {
  /** Pose tracks that contain the same source curve. */
  trackIds: PoseTrackId[]
  /** Source mean before normalization. */
  mean: number
  /** Source standard deviation before normalization. */
  scale: number
  /** Lowest source value used by generation-time clamping. */
  minimum: number
  /** Highest source value used by generation-time clamping. */
  maximum: number
}

/** The fit controls for the experimental Live2D VAR generator. */
export interface Live2DMotionVarOptions {
  /** Number of fixed-rate history frames in each prediction. */
  order: number
  /** Training and generation cadence in frames per second. */
  sampleRate: number
  /** Ridge penalty relative to the number of training rows. */
  ridge: number
}

/** A fitted experimental VAR model and the diagnostics shown by the devtool. */
export interface Live2DMotionVarModel {
  /** Controls that produced this fit. */
  options: Live2DMotionVarOptions
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
  baselinePose: Live2DMotionControlPose
}

/** An in-memory generator that advances one fixed-rate pose at a time. */
export interface Live2DMotionVarGenerator {
  /** Predicts one pose and scales the sampled correlated residual. */
  nextPose: (residualStrength: number) => Live2DMotionControlPose
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function mean(values: readonly number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function standardDeviation(values: readonly number[], average: number): number {
  const variance = values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function tracksMatch(frames: readonly Live2DMotionControlPose[], left: PoseTrackId, right: PoseTrackId): boolean {
  return frames.every(frame => Math.abs(frame[left] - frame[right]) <= 1e-8)
}

function createChannels(frames: readonly Live2DMotionControlPose[]): Live2DMotionVarChannel[] {
  const channels: Live2DMotionVarChannel[] = []
  for (const trackId of poseTrackIds) {
    const values = frames.map(frame => frame[trackId])
    const average = mean(values)
    const scale = standardDeviation(values, average)
    if (scale <= 1e-8)
      continue

    const matchingChannel = channels.find(channel => tracksMatch(frames, channel.trackIds[0], trackId))
    if (matchingChannel) {
      matchingChannel.trackIds.push(trackId)
      continue
    }

    channels.push({
      trackIds: [trackId],
      mean: average,
      scale,
      minimum: Math.min(...values),
      maximum: Math.max(...values),
    })
  }
  return channels
}

function createFeature(history: readonly number[][], order: number, channelCount: number, endIndex = history.length): number[] {
  const feature = [1]
  for (let lag = 1; lag <= order; lag++) {
    const frame = history[endIndex - lag]
    for (let channel = 0; channel < channelCount; channel++)
      feature.push(frame[channel])
  }
  return feature
}

function predict(coefficients: readonly number[][], feature: readonly number[]): number[] {
  const outputCount = coefficients[0].length
  const prediction = Array.from<number>({ length: outputCount }).fill(0)
  for (let featureIndex = 0; featureIndex < feature.length; featureIndex++) {
    for (let outputIndex = 0; outputIndex < outputCount; outputIndex++)
      prediction[outputIndex] += feature[featureIndex] * coefficients[featureIndex][outputIndex]
  }
  return prediction
}

function solvePositiveDefinite(matrix: readonly number[][], targets: readonly number[][]): number[][] {
  const size = matrix.length
  const outputCount = targets[0].length
  const lower = Array.from({ length: size }, () => Array.from<number>({ length: size }).fill(0))

  for (let row = 0; row < size; row++) {
    for (let column = 0; column <= row; column++) {
      let value = matrix[row][column]
      for (let index = 0; index < column; index++)
        value -= lower[row][index] * lower[column][index]

      if (row === column) {
        if (value <= 1e-12)
          throw new Error('The VAR fit is numerically singular. Increase the ridge penalty.')
        lower[row][column] = Math.sqrt(value)
      }
      else {
        lower[row][column] = value / lower[column][column]
      }
    }
  }

  const intermediate = Array.from({ length: size }, () => Array.from<number>({ length: outputCount }).fill(0))
  for (let row = 0; row < size; row++) {
    for (let output = 0; output < outputCount; output++) {
      let value = targets[row][output]
      for (let column = 0; column < row; column++)
        value -= lower[row][column] * intermediate[column][output]
      intermediate[row][output] = value / lower[row][row]
    }
  }

  const solution = Array.from({ length: size }, () => Array.from<number>({ length: outputCount }).fill(0))
  for (let row = size - 1; row >= 0; row--) {
    for (let output = 0; output < outputCount; output++) {
      let value = intermediate[row][output]
      for (let column = row + 1; column < size; column++)
        value -= lower[column][row] * solution[column][output]
      solution[row][output] = value / lower[row][row]
    }
  }
  return solution
}

function fitCoefficients(frames: readonly number[][], options: Live2DMotionVarOptions): number[][] {
  const channelCount = frames[0].length
  const featureCount = 1 + options.order * channelCount
  const gram = Array.from({ length: featureCount }, () => Array.from<number>({ length: featureCount }).fill(0))
  const cross = Array.from({ length: featureCount }, () => Array.from<number>({ length: channelCount }).fill(0))

  for (let frameIndex = options.order; frameIndex < frames.length; frameIndex++) {
    const feature = createFeature(frames, options.order, channelCount, frameIndex)
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

  return solvePositiveDefinite(gram, cross)
}

function createResiduals(frames: readonly number[][], coefficients: readonly number[][], order: number): number[][] {
  const channelCount = frames[0].length
  const residuals: number[][] = []
  for (let frameIndex = order; frameIndex < frames.length; frameIndex++) {
    const feature = createFeature(frames, order, channelCount, frameIndex)
    const prediction = predict(coefficients, feature)
    residuals.push(frames[frameIndex].map((value, channel) => value - prediction[channel]))
  }
  return residuals
}

function createRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

function poseFromChannels(
  baselinePose: Live2DMotionControlPose,
  channels: readonly Live2DMotionVarChannel[],
  values: readonly number[],
): Live2DMotionControlPose {
  const pose = { ...baselinePose }
  for (let channelIndex = 0; channelIndex < channels.length; channelIndex++) {
    const channel = channels[channelIndex]
    const rawValue = clamp(
      channel.mean + values[channelIndex] * channel.scale,
      channel.minimum,
      channel.maximum,
    )
    for (const trackId of channel.trackIds)
      pose[trackId] = rawValue
  }
  return pose
}

/**
 * Fits a ridge-regularized VAR to a fixed-rate projection of a motion recording.
 *
 * Exact duplicate tracks share one channel. Constant tracks keep their source mean.
 */
export function fitLive2DMotionVar(
  recording: ReadonlyLive2DMotionRecording,
  options: Live2DMotionVarOptions,
): Live2DMotionVarModel {
  const frameIntervalMs = 1000 / options.sampleRate
  const sourceFrameCount = Math.floor(recording.durationMs / frameIntervalMs) + 1
  const poses = Array.from(
    { length: sourceFrameCount },
    (_, index) => evaluateLive2DMotionRecording(recording, Math.min(recording.durationMs, index * frameIntervalMs)),
  )
  const channels = createChannels(poses)
  if (channels.length === 0)
    throw new Error('The current motion has no changing channels.')
  if (poses.length <= options.order + 1)
    throw new Error('The current motion is too short for this VAR order.')

  const baselinePose = { ...neutralLive2DMotionControlPose }
  for (const trackId of poseTrackIds)
    baselinePose[trackId] = mean(poses.map(pose => pose[trackId]))

  const trainingFrames = poses.map(pose => channels.map(channel => (pose[channel.trackIds[0]] - channel.mean) / channel.scale))
  const coefficients = fitCoefficients(trainingFrames, options)
  const residuals = createResiduals(trainingFrames, coefficients, options.order)
  const squaredResidualSum = residuals.reduce(
    (sum, residual) => sum + residual.reduce((channelSum, value) => channelSum + value ** 2, 0),
    0,
  )

  return {
    options,
    sourceDurationMs: recording.durationMs,
    sourceFrameCount,
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

/** Creates a seeded, residual-driven pose stream from a fitted VAR model. */
export function createLive2DMotionVarGenerator(model: Live2DMotionVarModel, seed: number): Live2DMotionVarGenerator {
  const random = createRandom(seed)
  const maximumStart = model.trainingFrames.length - model.options.order
  const start = Math.floor(random() * maximumStart)
  const history = model.trainingFrames
    .slice(start, start + model.options.order)
    .map(frame => [...frame])

  function nextPose(residualStrength: number): Live2DMotionControlPose {
    const feature = createFeature(history, model.options.order, model.channelCount)
    const prediction = predict(model.coefficients, feature)
    const residual = model.residuals[Math.floor(random() * model.residuals.length)]
    const nextFrame = prediction.map((value, channelIndex) => {
      const channel = model.channels[channelIndex]
      const rawValue = channel.mean + (value + residual[channelIndex] * residualStrength) * channel.scale
      const clampedValue = clamp(rawValue, channel.minimum, channel.maximum)
      return (clampedValue - channel.mean) / channel.scale
    })
    history.shift()
    history.push(nextFrame)
    return poseFromChannels(model.baselinePose, model.channels, nextFrame)
  }

  return { nextPose }
}
