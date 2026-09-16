/** Creates a deterministic uniform random stream from one unsigned seed. */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state += 0x6D2B79F5
    let value = state
    value = Math.imul(value ^ value >>> 15, value | 1)
    value ^= value + Math.imul(value ^ value >>> 7, value | 61)
    return ((value ^ value >>> 14) >>> 0) / 4294967296
  }
}

/** Samples an index from a normalized categorical distribution. */
export function sampleCategorical(probabilities: readonly number[], random: () => number): number {
  const target = random()
  let cumulative = 0
  for (let index = 0; index < probabilities.length; index++) {
    cumulative += probabilities[index]
    if (target <= cumulative)
      return index
  }
  return probabilities.length - 1
}

/** Creates a standard-normal random stream from a uniform random stream. */
export function createNormalRandom(random: () => number): () => number {
  let spare: number | undefined
  return () => {
    if (spare !== undefined) {
      const value = spare
      spare = undefined
      return value
    }

    const radius = Math.sqrt(-2 * Math.log(Math.max(Number.EPSILON, random())))
    const angle = 2 * Math.PI * random()
    spare = radius * Math.sin(angle)
    return radius * Math.cos(angle)
  }
}
