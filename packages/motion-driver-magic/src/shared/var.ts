import type { GenerateOptions, Generator, GeneratorOptions, TrainingSequence } from '../types'
import type { Channel } from './channels'

import { createBaselineFrame, createMotionChannels, frameFromChannels } from './channels'
import { createAutoregressiveFeature, predictAutoregressiveValues, solvePositiveDefinite } from './numeric'
import { createSeededRandom } from './random'

/** Fit controls shared by the VAR and AR-HMM implementations. */
export interface VarFitOptions {
  /** Number of fixed-rate history frames in each generation step. */
  order: number
  /** Ridge penalty relative to the number of training rows. */
  ridge: number
}

/** Internal VAR parameters shared by the VAR and AR-HMM implementations. */
export interface VarParameters {
  options: VarFitOptions
  sampleRateHz: number
  sourceFrameCount: number
  channelCount: number
  featureCount: number
  residualRootMeanSquare: number
  channels: Channel[]
  coefficients: number[][]
  residuals: number[][]
  trainingFrames: number[][]
  baselineFrame: number[]
}

function fitCoefficients(frames: readonly number[][], options: VarFitOptions): number[][] {
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

/** Fits the VAR parameters that both public methods use. */
export function fitVarParameters(sequence: TrainingSequence, options: VarFitOptions): VarParameters {
  if (!Number.isFinite(sequence.sampleRateHz) || sequence.sampleRateHz <= 0)
    throw new Error('The motion sample rate must be positive.')
  if (options.order < 1 || !Number.isInteger(options.order))
    throw new Error('The VAR order must be a positive integer.')

  const frames = sequence.frames
  if (frames.length === 0 || frames[0].length === 0)
    throw new Error('The motion sequence must contain at least one value.')
  if (frames.some(frame => frame.length !== frames[0].length))
    throw new Error('Every motion frame must have the same number of values.')

  const channels = createMotionChannels(frames)
  if (channels.length === 0)
    throw new Error('The current motion has no changing channels.')
  if (frames.length <= options.order + 1)
    throw new Error('The current motion is too short for this VAR order.')

  const baselineFrame = createBaselineFrame(frames)
  const trainingFrames = frames.map(frame => channels.map(
    channel => (frame[channel.valueIndices[0]] - channel.mean) / channel.scale,
  ))
  const coefficients = fitCoefficients(trainingFrames, options)
  const residuals = createResiduals(trainingFrames, coefficients, options.order)
  const squaredResidualSum = residuals.reduce(
    (sum, residual) => sum + residual.reduce((channelSum, value) => channelSum + value ** 2, 0),
    0,
  )

  return {
    options,
    sampleRateHz: sequence.sampleRateHz,
    sourceFrameCount: frames.length,
    channelCount: channels.length,
    featureCount: coefficients.length,
    residualRootMeanSquare: Math.sqrt(squaredResidualSum / (residuals.length * channels.length)),
    channels,
    coefficients,
    residuals,
    trainingFrames,
    baselineFrame,
  }
}

/** Creates one independent VAR generator from internal model parameters. */
export function toVarGenerator(parameters: VarParameters, options: GeneratorOptions): Generator {
  const random = createSeededRandom(options.seed)
  const maximumStart = parameters.trainingFrames.length - parameters.options.order
  const start = Math.floor(random() * maximumStart)
  const history = parameters.trainingFrames
    .slice(start, start + parameters.options.order)
    .map(frame => [...frame])

  function next(generateOptions?: GenerateOptions) {
    const noiseScale = generateOptions?.noiseScale ?? 1
    const feature = createAutoregressiveFeature(history, parameters.options.order, parameters.channelCount)
    const prediction = predictAutoregressiveValues(parameters.coefficients, feature)
    const residual = parameters.residuals[Math.floor(random() * parameters.residuals.length)]
    const nextFrame = prediction.map((value, channelIndex) => {
      const channel = parameters.channels[channelIndex]
      const rawValue = channel.mean + (value + residual[channelIndex] * noiseScale) * channel.scale
      const clampedValue = Math.min(channel.maximum, Math.max(channel.minimum, rawValue))
      return (clampedValue - channel.mean) / channel.scale
    })
    history.shift()
    history.push(nextFrame)
    return {
      values: frameFromChannels(parameters.baselineFrame, parameters.channels, nextFrame),
      state: undefined,
    }
  }

  return { sampleRateHz: parameters.sampleRateHz, next }
}
