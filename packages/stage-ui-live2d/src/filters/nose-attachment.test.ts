import { describe, expect, it } from 'vitest'

import { NoseAttachment } from './nose-attachment'

// Synthetic geometry keeps proprietary mesh samples out of the test suite.
const reference = [0, 0, 1, 0, 0, 1, 1, 1]
const indices = [0, 1, 2, 1, 3, 2]

describe('nose attachment', () => {
  it('follows translation, rotation, and scale around the authored center', () => {
    const center = [0.42, 0.18] as const
    const attachment = new NoseAttachment(reference, indices, center)
    for (const scale of [0.5, 1, 2]) {
      const vertices = new Float32Array(reference)
      for (let i = 0; i < vertices.length; i += 2) {
        const x = vertices[i]
        const y = vertices[i + 1]
        vertices[i] = scale * (0.8 * x - 0.6 * y) + 3
        vertices[i + 1] = scale * (0.6 * x + 0.8 * y) - 2
      }
      attachment.update(vertices)
      const point = attachment.matrix.apply({ x: scale * 0.1 + 3, y: scale * 0.7 - 2 })
      expect(point.x).toBeCloseTo(center[0], 5)
      expect(point.y).toBeCloseTo(center[1], 5)
    }
  })

  it('rejects a mesh without an invertible triangle', () => {
    expect(() => new NoseAttachment([0, 0, 1, 1, 2, 2], [0, 1, 2], [0.5, 0.5])).toThrow('nondegenerate')
  })
})
