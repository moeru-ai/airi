/** A smooth, random value in -1 to 1 at a point of 3D space. Close points give close values. */
export type Noise3D = (x: number, y: number, z: number) => number

const GRADIENTS = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
] as const

const SKEW = 1 / 3
const UNSKEW = 1 / 6

/**
 * Creates 3D simplex noise, Stefan Gustavson's public-domain algorithm. The same seed gives the same field.
 *
 * Visuals read the noise on a circle with time as the third axis, so an outline wobbles evenly and without a pattern.
 *
 * @example
 * const noise = createSimplexNoise3D(1)
 * noise(0.5, 0.25, 0) // A value in -1 to 1.
 */
export function createSimplexNoise3D(seed: number): Noise3D {
  // A Park-Miller generator shuffles the permutation table, so a seed always gives the same field.
  let state = Math.max(1, Math.floor(Math.abs(seed)) % 2147483647)
  const random = () => {
    state = (state * 16807) % 2147483647
    return (state - 1) / 2147483646
  }
  const table = Array.from({ length: 256 }, (_, index) => index)
  for (let index = 255; index > 0; index--) {
    const other = Math.floor(random() * (index + 1))
    ;[table[index], table[other]] = [table[other], table[index]]
  }
  const permutation = new Uint8Array(512)
  for (let index = 0; index < 512; index++)
    permutation[index] = table[index & 255]

  /** The contribution of one corner of the simplex: zero beyond a radius of about 0.77. */
  function corner(x: number, y: number, z: number, i: number, j: number, k: number) {
    let falloff = 0.6 - x * x - y * y - z * z
    if (falloff <= 0)
      return 0
    const gradient = GRADIENTS[permutation[i + permutation[j + permutation[k]]] % 12]
    falloff *= falloff
    return falloff * falloff * (gradient[0] * x + gradient[1] * y + gradient[2] * z)
  }

  return (x, y, z) => {
    // Skew the input space to find the simplex cell, then unskew back to get the offset inside it.
    const skew = (x + y + z) * SKEW
    const i = Math.floor(x + skew)
    const j = Math.floor(y + skew)
    const k = Math.floor(z + skew)
    const unskew = (i + j + k) * UNSKEW
    const x0 = x - (i - unskew)
    const y0 = y - (j - unskew)
    const z0 = z - (k - unskew)

    // The order of the offsets picks which of the six tetrahedra of the cell holds the point.
    let i1, j1, k1, i2, j2, k2
    if (x0 >= y0) {
      if (y0 >= z0)
        [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 1, 0]
      else if (x0 >= z0)
        [i1, j1, k1, i2, j2, k2] = [1, 0, 0, 1, 0, 1]
      else
        [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 1, 0, 1]
    }
    else if (y0 < z0) {
      [i1, j1, k1, i2, j2, k2] = [0, 0, 1, 0, 1, 1]
    }
    else if (x0 < z0) {
      [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 0, 1, 1]
    }
    else {
      [i1, j1, k1, i2, j2, k2] = [0, 1, 0, 1, 1, 0]
    }

    const ii = i & 255
    const jj = j & 255
    const kk = k & 255
    const sum = corner(x0, y0, z0, ii, jj, kk)
      + corner(x0 - i1 + UNSKEW, y0 - j1 + UNSKEW, z0 - k1 + UNSKEW, ii + i1, jj + j1, kk + k1)
      + corner(x0 - i2 + 2 * UNSKEW, y0 - j2 + 2 * UNSKEW, z0 - k2 + 2 * UNSKEW, ii + i2, jj + j2, kk + k2)
      + corner(x0 - 1 + 3 * UNSKEW, y0 - 1 + 3 * UNSKEW, z0 - 1 + 3 * UNSKEW, ii + 1, jj + 1, kk + 1)
    // 32 scales the sum to about -1 to 1.
    return 32 * sum
  }
}
