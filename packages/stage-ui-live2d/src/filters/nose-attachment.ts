import { Matrix } from '@pixi/math'

/**
 * Maps current model positions to the fitted nose coordinates. The small painted
 * nose mesh owns this deformation; the broad Face mesh moves differently.
 * Update once per draw and share the matrix across all face drawables.
 */
export class NoseAttachment {
  readonly matrix = new Matrix()
  private readonly reference = new Matrix()
  private readonly triangle: [number, number, number] = [0, 0, 0]

  constructor(reference: readonly number[], indices: ArrayLike<number>) {
    let area = 0
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    for (let i = 0; i < reference.length; i += 2) {
      minX = Math.min(minX, reference[i])
      maxX = Math.max(maxX, reference[i])
      minY = Math.min(minY, reference[i + 1])
      maxY = Math.max(maxY, reference[i + 1])
    }
    // Use the largest authored triangle to avoid an unstable inverse from a
    // narrow edge triangle. This fixed triangle follows every subsequent pose.
    for (let i = 0; i < indices.length; i += 3) {
      const [a, b, c] = [indices[i] * 2, indices[i + 1] * 2, indices[i + 2] * 2]
      const candidate = Math.abs((reference[b] - reference[a]) * (reference[c + 1] - reference[a + 1]) - (reference[c] - reference[a]) * (reference[b + 1] - reference[a + 1]))
      if (candidate > area) {
        area = candidate
        this.triangle[0] = a
        this.triangle[1] = b
        this.triangle[2] = c
      }
    }
    if (!area)
      throw new Error('The reviewed nose mesh must contain a nondegenerate triangle.')
    const [a, b, c] = this.triangle
    // The fitted bump uses (256,143) in a 512x640 reference. Register that tip
    // to the center of the painted highlight, rather than paint a second nose.
    this.reference.set(
      reference[b] - reference[a],
      reference[b + 1] - reference[a + 1],
      reference[c] - reference[a],
      reference[c + 1] - reference[a + 1],
      reference[a] + 0.5 - (minX + maxX) / 2,
      reference[a + 1] + 0.2234375 - (minY + maxY) / 2,
    )
  }

  /** Updates the model-to-nose transform from this frame's Cubism vertices. */
  update(vertices: Float32Array) {
    const [a, b, c] = this.triangle
    this.matrix.set(
      vertices[b] - vertices[a],
      vertices[b + 1] - vertices[a + 1],
      vertices[c] - vertices[a],
      vertices[c + 1] - vertices[a + 1],
      vertices[a],
      vertices[a + 1],
    ).invert().prepend(this.reference)
  }
}
