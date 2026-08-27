/** Clamps a value to an inclusive range. */
export function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

/** Creates one intercept-and-lag feature vector from autoregressive history. */
export function createAutoregressiveFeature(
  frames: readonly number[][],
  order: number,
  channelCount: number,
  endIndex = frames.length,
): number[] {
  const feature = [1]
  for (let lag = 1; lag <= order; lag++) {
    const frame = frames[endIndex - lag]
    for (let channel = 0; channel < channelCount; channel++)
      feature.push(frame[channel])
  }
  return feature
}

/** Applies autoregressive coefficients to one feature vector. */
export function predictAutoregressiveValues(
  coefficients: readonly number[][],
  feature: readonly number[],
): number[] {
  const outputCount = coefficients[0].length
  const prediction = Array.from<number>({ length: outputCount }).fill(0)
  for (let featureIndex = 0; featureIndex < feature.length; featureIndex++) {
    for (let outputIndex = 0; outputIndex < outputCount; outputIndex++)
      prediction[outputIndex] += feature[featureIndex] * coefficients[featureIndex][outputIndex]
  }
  return prediction
}

/** Computes the lower-triangular Cholesky factor of a positive-definite matrix. */
export function cholesky(matrix: readonly number[][], singularMessage: string): number[][] {
  const size = matrix.length
  const lower = Array.from({ length: size }, () => Array.from<number>({ length: size }).fill(0))
  for (let row = 0; row < size; row++) {
    for (let column = 0; column <= row; column++) {
      let value = matrix[row][column]
      for (let index = 0; index < column; index++)
        value -= lower[row][index] * lower[column][index]

      if (row === column) {
        if (value <= 1e-12)
          throw new Error(singularMessage)
        lower[row][column] = Math.sqrt(value)
      }
      else {
        lower[row][column] = value / lower[column][column]
      }
    }
  }
  return lower
}

/** Solves a positive-definite linear system for one or more target columns. */
export function solvePositiveDefinite(
  matrix: readonly number[][],
  targets: readonly number[][],
  singularMessage: string,
): number[][] {
  const lower = cholesky(matrix, singularMessage)
  const size = matrix.length
  const outputCount = targets[0].length
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
