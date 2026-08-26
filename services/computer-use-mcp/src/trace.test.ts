import { describe, expect, it } from 'vitest'

import { buildPointerTrace } from './trace'

describe('buildPointerTrace', () => {
  it('returns no movement when the pointer is already at the target', () => {
    expect(buildPointerTrace({
      from: { x: 180, y: 150 },
      to: { x: 180, y: 150 },
    })).toEqual([])
  })

  it('removes consecutive duplicate rounded points while preserving the final target', () => {
    const trace = buildPointerTrace({
      from: { x: 179, y: 149 },
      to: { x: 180, y: 150 },
      steps: 20,
    })

    expect(trace.length).toBeGreaterThan(0)
    expect(trace.at(-1)).toMatchObject({ x: 180, y: 150 })

    for (let index = 1; index < trace.length; index += 1) {
      expect(trace[index]).not.toMatchObject({
        x: trace[index - 1].x,
        y: trace[index - 1].y,
      })
    }
  })
})
