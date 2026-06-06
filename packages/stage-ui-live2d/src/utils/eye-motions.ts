const EYE_SACCADE_INT_STEP = 400
const EYE_SACCADE_INT_P = [
  [0.075, 800],
  [0.11, 0],
  [0.125, 0],
  [0.14, 0],
  [0.125, 0],
  [0.05, 0],
  [0.04, 0],
  [0.03, 0],
  [0.02, 0],
  [1.0, 0],
]
for (let i = 1; i < EYE_SACCADE_INT_P.length; i++) {
  EYE_SACCADE_INT_P[i][0] += EYE_SACCADE_INT_P[i - 1][0]
  EYE_SACCADE_INT_P[i][1] = EYE_SACCADE_INT_P[i - 1][1] + EYE_SACCADE_INT_STEP
}

/**
 * This is a simple function to generate a random interval between eye saccades.
 *
 * @returns Interval in milliseconds
 */
export function randomSaccadeInterval(): number {
  const r = Math.random()
  // eslint-disable-next-line no-restricted-syntax
  for (const entry of EYE_SACCADE_INT_P) {
    if (r <= entry[0]) {
      return entry[1] + Math.random() * EYE_SACCADE_INT_STEP
    }
  }
  return EYE_SACCADE_INT_P.at(-1)![1] + Math.random() * EYE_SACCADE_INT_STEP
}
