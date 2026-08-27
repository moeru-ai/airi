import { describe, expect, it } from 'vitest'

import { defaultLive2DMotionRecording } from './default-recording'

describe('default Live2D motion recording', () => {
  it('loads the idle-excited trajectory', () => {
    expect(defaultLive2DMotionRecording.format).toBe('airi-live2d-motion/v6')
    expect(defaultLive2DMotionRecording.durationMs).toBe(60782)
    expect(defaultLive2DMotionRecording.samples).toHaveLength(1358)
    expect(defaultLive2DMotionRecording.samples[0].atMs).toBe(0)
  })
})
