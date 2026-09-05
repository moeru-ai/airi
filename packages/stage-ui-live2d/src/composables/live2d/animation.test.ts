import type { InternalModel } from 'pixi-live2d-display'

import { describe, expect, it, vi } from 'vitest'

import { useLive2DIdleEyeFocus } from './animation'

/**
 * Stands in for the parts of `InternalModel` the idle gaze touches. The focus
 * controller is the SDK's own instance in production; only `focus` and `update`
 * matter here, and `update` exists purely so the test can prove it is never
 * called from this layer.
 */
function createModel() {
  return {
    focusController: {
      focus: vi.fn(),
      update: vi.fn(),
    },
  } as unknown as InternalModel & { focusController: { focus: ReturnType<typeof vi.fn>, update: ReturnType<typeof vi.fn> } }
}

describe('useLive2DIdleEyeFocus', () => {
  // ROOT CAUSE:
  //
  // `randomSaccadeInterval()` returns milliseconds, but the schedule divided it
  // by 1000 before adding it to the model clock:
  //
  //   nextSaccadeAfter = now + (randomSaccadeInterval() / 1000)
  //
  // That was calibrated for Cubism 4, whose `now` is in seconds. Cubism 2 passes
  // milliseconds through the same hook, so an ~800ms interval became ~0.8ms and
  // a new gaze target was picked on essentially every rendered frame. Because
  // `updateFocus()` folds the focus controller into the head and body angles as
  // well as the eyeballs, that read as the head twitching.
  //
  // We fixed this by normalizing the hook's clock to milliseconds and dropping
  // the conversion here, so the interval is used in its native unit.
  it('holds a gaze target for the full saccade interval instead of retargeting every frame', () => {
    const model = createModel()
    const { update } = useLive2DIdleEyeFocus()

    update(model, 0)
    expect(model.focusController.focus).toHaveBeenCalledTimes(1)

    // 400ms of ~60fps frames. The shortest interval the distribution can produce
    // is 800ms, so none of these may retarget.
    for (let frameAtMs = 16.6; frameAtMs <= 400; frameAtMs += 16.6)
      update(model, frameAtMs)

    expect(model.focusController.focus).toHaveBeenCalledTimes(1)
  })

  it('retargets once the longest possible interval has elapsed', () => {
    const model = createModel()
    const { update } = useLive2DIdleEyeFocus()

    update(model, 0)
    // Past the distribution's 4800ms ceiling, so a saccade is due whatever the
    // random draw was.
    update(model, 4801)

    expect(model.focusController.focus).toHaveBeenCalledTimes(2)
  })

  // ROOT CAUSE:
  //
  // This layer used to advance the interpolator itself:
  //
  //   model.focusController.update(now - lastSaccadeAt)
  //
  // `InternalModel.update` already calls `focusController.update(dt)` once per
  // frame before delegating to `motionManager.update`, so the spring was
  // integrated twice. The second step also used the time since the last saccade
  // rather than the frame delta, so it grew from 16ms toward the full interval
  // and then snapped back to zero on every retarget.
  it('leaves the focus interpolator to the SDK frame update', () => {
    const model = createModel()
    const { update } = useLive2DIdleEyeFocus()

    update(model, 0)
    update(model, 16.6)
    update(model, 33.2)

    expect(model.focusController.update).not.toHaveBeenCalled()
  })

  it('keeps the focus target within the range the SDK scales into head angles', () => {
    const model = createModel()
    const { update } = useLive2DIdleEyeFocus()

    update(model, 0)

    const [x, y, instant] = model.focusController.focus.mock.calls[0]
    expect(x).toBeGreaterThanOrEqual(-0.5)
    expect(x).toBeLessThanOrEqual(0.5)
    expect(y).toBeGreaterThanOrEqual(-0.5)
    expect(y).toBeLessThanOrEqual(0.35)
    expect(instant).toBe(false)
  })
})
