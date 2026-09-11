import type { VarParameters } from './shared/var'
import type {
  Frame,
  GenerateOptions,
  Generator,
  GeneratorOptions,
  Model as MotionModel,
  TrainingSequence,
} from './types'

import { clamp } from 'es-toolkit/math'

import { frameFromChannels } from './shared/channels'
import { cholesky, createAutoregressiveFeature, predictAutoregressiveValues, solvePositiveDefinite } from './shared/numeric'
import { createNormalRandom, createSeededRandom, sampleCategorical } from './shared/random'
import { fitVarParameters } from './shared/var'

/** Fit controls for the experimental autoregressive hidden Markov model. */
export interface FitOptions {
  /** Number of hidden motion regimes. */
  stateCount: number
  /** Number of fixed-rate history frames in each state-specific prediction. */
  order: number
  /** Ridge penalty relative to each state's effective sample count. */
  ridge: number
  /** Number of expectation-maximization updates. */
  iterations: number
}

interface StateParameters {
  coefficients: number[][]
  covariance: number[][]
  covarianceCholesky: number[][]
}

interface Parameters {
  options: FitOptions
  /** Shared fixed-rate frames, channel mapping, and source statistics. */
  sourceModel: VarParameters
  /** Initial hidden-state probabilities. */
  initialProbabilities: number[]
  /** Probability of each next state, indexed by current state and next state. */
  transitionProbabilities: number[][]
  /** State-specific autoregressive coefficients and Gaussian noise. */
  states: StateParameters[]
  /** Smoothed hidden-state probabilities for each fitted source frame. */
  posteriorProbabilities: number[][]
}

/** Stable measurements from one AR-HMM fit. */
export interface Diagnostics {
  /** Number of fixed-rate source frames used by the fit. */
  sourceFrameCount: number
  /** Number of varying, non-duplicate motion channels. */
  channelCount: number
  /** Number of intercept and lag terms in each state equation. */
  featureCount: number
  /** Number of hidden motion regimes. */
  stateCount: number
  /** Final marginal log likelihood divided by the fitted frame count. */
  meanLogLikelihoodPerFrame: number
  /** Fraction of fitted source frames assigned to each hidden state. */
  stateOccupancy: readonly number[]
  /** Occupancy-weighted geometric state duration in seconds. */
  meanDwellSeconds: number
}

/** A reusable AR-HMM model. */
export type ArHmmModel = MotionModel<'ar-hmm', number, Diagnostics>

interface ExpectationResult {
  gamma: number[][]
  transitionCounts: number[][]
  logLikelihood: number
}

function logSumExp(values: readonly number[]): number {
  const maximum = Math.max(...values)
  let sum = 0
  for (const value of values)
    sum += Math.exp(value - maximum)
  return maximum + Math.log(sum)
}

function normalizeProbabilities(values: readonly number[]): number[] {
  const sum = values.reduce((total, value) => total + value, 0)
  return values.map(value => value / sum)
}

function squaredDistance(left: readonly number[], right: readonly number[]): number {
  return left.reduce((sum, value, index) => sum + (value - right[index]) ** 2, 0)
}

function createClusterFeatures(frames: readonly number[][], order: number): number[][] {
  const channelCount = frames[0].length
  const velocityScales = Array.from<number>({ length: channelCount }).fill(0)
  for (let frameIndex = order; frameIndex < frames.length; frameIndex++) {
    for (let channel = 0; channel < channelCount; channel++)
      velocityScales[channel] += (frames[frameIndex][channel] - frames[frameIndex - 1][channel]) ** 2
  }
  for (let channel = 0; channel < channelCount; channel++)
    velocityScales[channel] = Math.max(1e-6, Math.sqrt(velocityScales[channel] / (frames.length - order)))

  return frames.slice(order).map((frame, rowIndex) => [
    ...frame,
    ...frame.map((value, channel) => (value - frames[rowIndex + order - 1][channel]) / velocityScales[channel]),
  ])
}

function initializeAssignments(features: readonly number[][], stateCount: number): number[] {
  const velocityOffset = features[0].length / 2
  let quietestIndex = 0
  let quietestSpeed = Number.POSITIVE_INFINITY
  for (let index = 0; index < features.length; index++) {
    const speed = features[index].slice(velocityOffset).reduce((sum, value) => sum + value ** 2, 0)
    if (speed < quietestSpeed) {
      quietestSpeed = speed
      quietestIndex = index
    }
  }

  const centroids = [[...features[quietestIndex]]]
  while (centroids.length < stateCount) {
    let farthestIndex = 0
    let farthestDistance = -1
    for (let index = 0; index < features.length; index++) {
      const distance = Math.min(...centroids.map(centroid => squaredDistance(features[index], centroid)))
      if (distance > farthestDistance) {
        farthestDistance = distance
        farthestIndex = index
      }
    }
    centroids.push([...features[farthestIndex]])
  }

  const assignments = Array.from<number>({ length: features.length }).fill(0)
  for (let iteration = 0; iteration < 12; iteration++) {
    for (let row = 0; row < features.length; row++) {
      let bestState = 0
      let bestDistance = Number.POSITIVE_INFINITY
      for (let state = 0; state < stateCount; state++) {
        const distance = squaredDistance(features[row], centroids[state])
        if (distance < bestDistance) {
          bestDistance = distance
          bestState = state
        }
      }
      assignments[row] = bestState
    }

    const nextCentroids = Array.from(
      { length: stateCount },
      () => Array.from<number>({ length: features[0].length }).fill(0),
    )
    const counts = Array.from<number>({ length: stateCount }).fill(0)
    for (let row = 0; row < features.length; row++) {
      counts[assignments[row]]++
      for (let feature = 0; feature < features[row].length; feature++)
        nextCentroids[assignments[row]][feature] += features[row][feature]
    }
    for (let state = 0; state < stateCount; state++) {
      if (counts[state] === 0)
        continue
      centroids[state] = nextCentroids[state].map(value => value / counts[state])
    }
  }
  return assignments
}

function createInitialExpectations(assignments: readonly number[], stateCount: number): ExpectationResult {
  const probabilityFloor = 0.001
  const gamma = assignments.map(assignedState => Array.from(
    { length: stateCount },
    (_, state) => state === assignedState ? 1 - probabilityFloor * (stateCount - 1) : probabilityFloor,
  ))
  const transitionCounts = Array.from(
    { length: stateCount },
    () => Array.from<number>({ length: stateCount }).fill(0.1),
  )
  for (let row = 1; row < assignments.length; row++)
    transitionCounts[assignments[row - 1]][assignments[row]]++
  return { gamma, transitionCounts, logLikelihood: Number.NEGATIVE_INFINITY }
}

function fitStateCoefficients(
  frames: readonly number[][],
  gamma: readonly number[][],
  state: number,
  sourceModel: VarParameters,
  options: FitOptions,
): number[][] {
  const channelCount = sourceModel.channelCount
  const featureCount = 1 + options.order * channelCount
  const gram = Array.from({ length: featureCount }, () => Array.from<number>({ length: featureCount }).fill(0))
  const cross = Array.from({ length: featureCount }, () => Array.from<number>({ length: channelCount }).fill(0))
  let stateWeight = 0

  for (let row = 0; row < gamma.length; row++) {
    const weight = gamma[row][state]
    const frameIndex = row + options.order
    const feature = createAutoregressiveFeature(frames, options.order, channelCount, frameIndex)
    const target = frames[frameIndex]
    stateWeight += weight
    for (let featureRow = 0; featureRow < featureCount; featureRow++) {
      for (let featureColumn = 0; featureColumn <= featureRow; featureColumn++)
        gram[featureRow][featureColumn] += weight * feature[featureRow] * feature[featureColumn]
      for (let output = 0; output < channelCount; output++)
        cross[featureRow][output] += weight * feature[featureRow] * target[output]
    }
  }

  if (stateWeight < featureCount + 1)
    return sourceModel.coefficients.map(row => [...row])

  for (let row = 0; row < featureCount; row++) {
    for (let column = 0; column < row; column++)
      gram[column][row] = gram[row][column]
  }
  for (let index = 1; index < featureCount; index++)
    gram[index][index] += options.ridge * stateWeight
  return solvePositiveDefinite(gram, cross, 'The AR-HMM fit produced a singular covariance.')
}

function fitStateCovariance(
  frames: readonly number[][],
  gamma: readonly number[][],
  state: number,
  coefficients: readonly number[][],
  options: FitOptions,
): number[][] {
  const channelCount = frames[0].length
  const covariance = Array.from({ length: channelCount }, () => Array.from<number>({ length: channelCount }).fill(0))
  let stateWeight = 0
  for (let row = 0; row < gamma.length; row++) {
    const weight = gamma[row][state]
    const frameIndex = row + options.order
    const feature = createAutoregressiveFeature(frames, options.order, channelCount, frameIndex)
    const prediction = predictAutoregressiveValues(coefficients, feature)
    const residual = frames[frameIndex].map((value, channel) => value - prediction[channel])
    stateWeight += weight
    for (let left = 0; left < channelCount; left++) {
      for (let right = 0; right <= left; right++)
        covariance[left][right] += weight * residual[left] * residual[right]
    }
  }

  for (let left = 0; left < channelCount; left++) {
    for (let right = 0; right <= left; right++) {
      covariance[left][right] /= stateWeight
      covariance[right][left] = covariance[left][right]
    }
    covariance[left][left] += 0.0025
  }
  return covariance
}

function maximizeParameters(
  sourceModel: VarParameters,
  expectation: ExpectationResult,
  options: FitOptions,
): Pick<Parameters, 'initialProbabilities' | 'transitionProbabilities' | 'states'> {
  const initialProbabilities = normalizeProbabilities(expectation.gamma[0].map(value => value + 0.1))
  const transitionProbabilities = expectation.transitionCounts.map((row, state) => normalizeProbabilities(
    row.map((value, nextState) => value + (state === nextState ? 2 : 0.1)),
  ))
  const states = Array.from({ length: options.stateCount }, (_, state) => {
    const coefficients = fitStateCoefficients(sourceModel.trainingFrames, expectation.gamma, state, sourceModel, options)
    const covariance = fitStateCovariance(sourceModel.trainingFrames, expectation.gamma, state, coefficients, options)
    return {
      coefficients,
      covariance,
      covarianceCholesky: cholesky(covariance, 'The AR-HMM fit produced a singular covariance.'),
    }
  })
  return { initialProbabilities, transitionProbabilities, states }
}

function emissionLogProbability(
  state: StateParameters,
  feature: readonly number[],
  observation: readonly number[],
): number {
  const prediction = predictAutoregressiveValues(state.coefficients, feature)
  const solved = Array.from<number>({ length: observation.length }).fill(0)
  for (let row = 0; row < observation.length; row++) {
    let value = observation[row] - prediction[row]
    for (let column = 0; column < row; column++)
      value -= state.covarianceCholesky[row][column] * solved[column]
    solved[row] = value / state.covarianceCholesky[row][row]
  }
  const quadratic = solved.reduce((sum, value) => sum + value ** 2, 0)
  const logDeterminant = 2 * state.covarianceCholesky.reduce((sum, row, index) => sum + Math.log(row[index]), 0)
  return -0.5 * (observation.length * Math.log(2 * Math.PI) + logDeterminant + quadratic)
}

function expectationStep(
  sourceModel: VarParameters,
  parameters: Pick<Parameters, 'initialProbabilities' | 'transitionProbabilities' | 'states'>,
  options: FitOptions,
): ExpectationResult {
  const frames = sourceModel.trainingFrames
  const rowCount = frames.length - options.order
  const emissions = Array.from({ length: rowCount }, (_, row) => {
    const frameIndex = row + options.order
    const feature = createAutoregressiveFeature(frames, options.order, sourceModel.channelCount, frameIndex)
    return parameters.states.map(state => emissionLogProbability(state, feature, frames[frameIndex]))
  })
  const logTransitions = parameters.transitionProbabilities.map(row => row.map(Math.log))
  const alpha = Array.from({ length: rowCount }, () => Array.from<number>({ length: options.stateCount }).fill(0))
  const firstAlpha = parameters.initialProbabilities.map((probability, state) => Math.log(probability) + emissions[0][state])
  let scale = logSumExp(firstAlpha)
  let logLikelihood = scale
  alpha[0] = firstAlpha.map(value => value - scale)

  for (let row = 1; row < rowCount; row++) {
    const nextAlpha = Array.from({ length: options.stateCount }, (_, state) => emissions[row][state] + logSumExp(
      alpha[row - 1].map((value, previousState) => value + logTransitions[previousState][state]),
    ))
    scale = logSumExp(nextAlpha)
    logLikelihood += scale
    alpha[row] = nextAlpha.map(value => value - scale)
  }

  const beta = Array.from({ length: rowCount }, () => Array.from<number>({ length: options.stateCount }).fill(0))
  for (let row = rowCount - 2; row >= 0; row--) {
    const nextBeta = Array.from({ length: options.stateCount }, (_, state) => logSumExp(
      beta[row + 1].map((value, nextState) => logTransitions[state][nextState] + emissions[row + 1][nextState] + value),
    ))
    const betaScale = logSumExp(nextBeta)
    beta[row] = nextBeta.map(value => value - betaScale)
  }

  const gamma = alpha.map((row, rowIndex) => {
    const values = row.map((value, state) => value + beta[rowIndex][state])
    const normalization = logSumExp(values)
    return values.map(value => Math.exp(value - normalization))
  })
  const transitionCounts = Array.from(
    { length: options.stateCount },
    () => Array.from<number>({ length: options.stateCount }).fill(0),
  )
  for (let row = 0; row < rowCount - 1; row++) {
    const values = alpha[row].flatMap((value, state) => parameters.states.map(
      (_nextStateModel, nextState) => value + logTransitions[state][nextState] + emissions[row + 1][nextState] + beta[row + 1][nextState],
    ))
    const normalization = logSumExp(values)
    for (let state = 0; state < options.stateCount; state++) {
      for (let nextState = 0; nextState < options.stateCount; nextState++)
        transitionCounts[state][nextState] += Math.exp(values[state * options.stateCount + nextState] - normalization)
    }
  }
  return { gamma, transitionCounts, logLikelihood }
}

/** Creates a linear Gaussian AR-HMM model with deterministic clustering and EM updates. */
export function createArHmmModel(sequence: TrainingSequence, options: FitOptions): ArHmmModel {
  if (options.stateCount < 2 || !Number.isInteger(options.stateCount))
    throw new Error('The AR-HMM state count must be an integer greater than one.')
  if (options.iterations < 1 || !Number.isInteger(options.iterations))
    throw new Error('The AR-HMM iteration count must be a positive integer.')

  const sourceModel = fitVarParameters(sequence, {
    order: options.order,
    ridge: options.ridge,
  })
  const rowCount = sourceModel.trainingFrames.length - options.order
  if (rowCount < options.stateCount * (sourceModel.featureCount + 1))
    throw new Error('The current motion is too short for this AR-HMM shape.')

  const clusterFeatures = createClusterFeatures(sourceModel.trainingFrames, options.order)
  const assignments = initializeAssignments(clusterFeatures, options.stateCount)
  let expectation = createInitialExpectations(assignments, options.stateCount)
  let stateParameters = maximizeParameters(sourceModel, expectation, options)
  const logLikelihoods: number[] = []
  for (let iteration = 0; iteration < options.iterations; iteration++) {
    expectation = expectationStep(sourceModel, stateParameters, options)
    logLikelihoods.push(expectation.logLikelihood)
    stateParameters = maximizeParameters(sourceModel, expectation, options)
  }
  expectation = expectationStep(sourceModel, stateParameters, options)
  logLikelihoods.push(expectation.logLikelihood)

  const stateWeights = Array.from({ length: options.stateCount }, (_, state) => expectation.gamma.reduce(
    (sum, probabilities) => sum + probabilities[state],
    0,
  ))
  const stateOccupancy = normalizeProbabilities(stateWeights)
  const meanDwellFrames = stateOccupancy.reduce((sum, occupancy, state) => {
    const leaveProbability = Math.max(1 / rowCount, 1 - stateParameters.transitionProbabilities[state][state])
    return sum + occupancy / leaveProbability
  }, 0)

  const modelParameters: Parameters = {
    options,
    sourceModel,
    ...stateParameters,
    posteriorProbabilities: expectation.gamma,
  }

  const diagnostics: Diagnostics = Object.freeze({
    sourceFrameCount: sourceModel.sourceFrameCount,
    channelCount: sourceModel.channelCount,
    featureCount: sourceModel.featureCount,
    stateCount: options.stateCount,
    meanLogLikelihoodPerFrame: logLikelihoods.at(-1)! / expectation.gamma.length,
    stateOccupancy: Object.freeze([...stateOccupancy]),
    meanDwellSeconds: meanDwellFrames / sourceModel.sampleRateHz,
  })

  return Object.freeze({
    method: 'ar-hmm',
    sampleRateHz: sourceModel.sampleRateHz,
    diagnostics,
    toGenerator: (generatorOptions: GeneratorOptions) => toGenerator(modelParameters, generatorOptions),
  })
}

function toGenerator(model: Parameters, options: GeneratorOptions): Generator<number> {
  const random = createSeededRandom(options.seed)
  const normalRandom = createNormalRandom(random)
  const maximumStart = model.sourceModel.trainingFrames.length - model.options.order
  const start = Math.floor(random() * maximumStart)
  const history = model.sourceModel.trainingFrames
    .slice(start, start + model.options.order)
    .map(frame => [...frame])
  let state = sampleCategorical(model.posteriorProbabilities[start], random)

  function next(generateOptions?: GenerateOptions): Frame<number> {
    const noiseScale = generateOptions?.noiseScale ?? 1
    state = sampleCategorical(model.transitionProbabilities[state], random)
    const stateModel = model.states[state]
    const feature = createAutoregressiveFeature(history, model.options.order, model.sourceModel.channelCount)
    const prediction = predictAutoregressiveValues(stateModel.coefficients, feature)
    const gaussian = Array.from({ length: model.sourceModel.channelCount }, normalRandom)
    const nextValues = prediction.map((value, channel) => {
      let noise = 0
      for (let source = 0; source <= channel; source++)
        noise += stateModel.covarianceCholesky[channel][source] * gaussian[source]
      const sourceChannel = model.sourceModel.channels[channel]
      const rawValue = sourceChannel.mean + (value + noise * noiseScale) * sourceChannel.scale
      const clampedValue = clamp(rawValue, sourceChannel.minimum, sourceChannel.maximum)
      return (clampedValue - sourceChannel.mean) / sourceChannel.scale
    })
    history.shift()
    history.push(nextValues)
    return {
      values: frameFromChannels(model.sourceModel.baselineFrame, model.sourceModel.channels, nextValues),
      state,
    }
  }

  return { sampleRateHz: model.sourceModel.sampleRateHz, next }
}
