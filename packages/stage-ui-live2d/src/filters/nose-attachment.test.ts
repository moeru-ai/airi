import { describe, expect, it } from 'vitest'

import profile from '../assets/lighting/iru.json'
import fixture from './nose-attachment.fixture.json'

import { NoseAttachment } from './nose-attachment'

const reference = profile.drawables.find(drawable => drawable.id === fixture.id)!.reference
describe('nose attachment', () => {
  it('keeps the nose coordinates on the painted mesh through actual head turns', () => {
    // ROOT CAUSE:
    // A fixed location on Face moved about 30 viewer pixels away from the nose
    // at head X +/-30. These vertex samples come from the actual Iru nose rig.
    const attachment = new NoseAttachment(reference, fixture.indices)
    for (const pose of fixture.poses) {
      attachment.update(new Float32Array(pose.vertices))
      const point = attachment.matrix.apply({ x: pose.paintedTip[0], y: pose.paintedTip[1] })
      expect(Math.abs(point.x - 0.5)).toBeLessThan(0.0002)
      expect(Math.abs(point.y - 0.2234375)).toBeLessThan(0.0002)
    }
  })

  it('keeps its registration through a translated, rolled and scaled pose', () => {
    const attachment = new NoseAttachment(reference, fixture.indices)
    const vertices = new Float32Array(fixture.poses[1].vertices)
    attachment.update(vertices)
    const before = attachment.matrix.apply({ x: vertices[0], y: vertices[1] })
    for (let i = 0; i < vertices.length; i += 2) {
      const x = vertices[i]
      const y = vertices[i + 1]
      vertices[i] = 2 * (0.8 * x - 0.6 * y) + 3
      vertices[i + 1] = 2 * (0.6 * x + 0.8 * y) - 2
    }
    attachment.update(vertices)
    const after = attachment.matrix.apply({ x: vertices[0], y: vertices[1] })
    expect(after.x).toBeCloseTo(before.x, 5)
    expect(after.y).toBeCloseTo(before.y, 5)
  })
})
