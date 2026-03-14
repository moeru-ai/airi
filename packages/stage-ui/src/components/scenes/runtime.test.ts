import { describe, expect, it } from 'vitest'

import { shouldRunLive2dLipSyncLoop } from './runtime'

describe('shouldRunLive2dLipSyncLoop', () => {
  it('runs only for live2d while not paused', () => {
    expect(shouldRunLive2dLipSyncLoop({ stageModelRenderer: 'live2d', paused: false })).toBe(true)
    expect(shouldRunLive2dLipSyncLoop({ stageModelRenderer: 'live2d', paused: true })).toBe(false)
    expect(shouldRunLive2dLipSyncLoop({ stageModelRenderer: 'vrm', paused: false })).toBe(false)
  })
})
