import { describe, expect, it } from 'vitest'

import { createStartupProgress } from './startup-progress'

describe('startup progress', () => {
  it('holds the final progress until route and scene dependencies finish', () => {
    const startup = createStartupProgress([
      { id: 'model', requires: [] },
      { id: 'route', requires: [] },
      { id: 'scene', requires: ['model', 'route'] },
    ] as const)

    expect(startup.progress.value).toBe(0)
    expect(() => startup.complete('scene')).toThrow('requires model')

    startup.complete('model')
    expect(() => startup.complete('scene')).toThrow('requires route')

    startup.complete('route')
    expect(startup.progress.value).toBe(67)
    expect(startup.isComplete('scene')).toBe(false)

    startup.complete('scene')
    startup.complete('scene')
    expect(startup.progress.value).toBe(100)
  })
})
