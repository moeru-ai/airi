import { describe, expect, it } from 'vitest'

import { shouldSampleStageTransparency } from '../utils/stage-three-transparency'
import { createDefaultWindowLifecycleState, shouldPauseStageFromLifecycle } from './stage-window-lifecycle'

describe('stage window lifecycle helpers', () => {
  it('pauses only for hidden or minimized window lifecycle states', () => {
    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'show',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'restore',
      visible: true,
    })).toBe(false)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      reason: 'hide',
      visible: false,
    })).toBe(true)

    expect(shouldPauseStageFromLifecycle({
      ...createDefaultWindowLifecycleState(),
      minimized: true,
      reason: 'minimize',
    })).toBe(true)
  })

  it('samples stage transparency only for mounted vrm stage while fade-on-hover is active', () => {
    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(true)

    expect(shouldSampleStageTransparency({
      componentState: 'loading',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: false,
      stageModelRenderer: 'vrm',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'live2d',
      stagePaused: false,
    })).toBe(false)

    expect(shouldSampleStageTransparency({
      componentState: 'mounted',
      fadeOnHoverEnabled: true,
      stageModelRenderer: 'vrm',
      stagePaused: true,
    })).toBe(false)
  })
})
