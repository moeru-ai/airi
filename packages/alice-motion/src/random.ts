/**
 * Seeded pseudo-random generator (mulberry32). The same seed gives the same sequence.
 *
 * Use it in the director and in tests, so a procedural trajectory can be reproduced.
 * Do not use it for anything that needs cryptographic strength.
 *
 * @example
 * const random = createSeededRandom(42)
 * random() // => a number in [0, 1), always the same for seed 42
 */
export function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let value = state
    value = Math.imul(value ^ (value >>> 15), value | 1)
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61)
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296
  }
}

/** A value in `[min, max)` from a random source. */
export function randomBetween(random: () => number, min: number, max: number) {
  return min + random() * (max - min)
}
