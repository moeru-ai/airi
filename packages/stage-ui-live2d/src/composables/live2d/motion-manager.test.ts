import type { Live2DBreathControlState } from '../../stores/motion-control'
import type { MotionManagerPluginContext, PixiLive2DInternalModel } from './motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { neutralLive2DMotionControlPose } from '../../stores/motion-control'
import { createLive2DMotionSpring } from './motion-control-spring'
import {
  disableLive2DSdkBreath,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginBreathControl,
  useMotionUpdatePluginIdleDisable,
  useMotionUpdatePluginLightSquint,
  useMotionUpdatePluginManualControl,
} from './motion-manager'

vi.mock('./animation', () => ({
  useLive2DIdleEyeFocus: () => ({ update: vi.fn() }),
}))

function createModel(initialValues: Record<string, number> = {}) {
  const values = new Map(Object.entries(initialValues))
  return {
    getParameterValueById: vi.fn((id: string) => values.get(id) ?? 1),
    setParameterValueById: vi.fn((id: string, value: number) => {
      values.set(id, value)
    }),
    values,
  }
}

function createContext(overrides: Partial<MotionManagerPluginContext> = {}): MotionManagerPluginContext {
  const model = createModel({
    ParamEyeLOpen: 1,
    ParamEyeROpen: 1,
  })
  const context = {
    model,
    now: 1000,
    timeDelta: 16,
    internalModel: {
      eyeBlink: {
        updateParameters: vi.fn((targetModel: typeof model) => {
          targetModel.setParameterValueById('ParamEyeLOpen', 0.5)
          targetModel.setParameterValueById('ParamEyeROpen', 0.25)
        }),
      },
      coreModel: model,
    } as unknown as PixiLive2DInternalModel,
    motionManager: {
      stopAllMotions: vi.fn(),
      state: { currentGroup: undefined },
      groups: { idle: 'Idle' },
    } as unknown as PixiLive2DInternalModel['motionManager'],
    modelParameters: ref({
      leftEyeOpen: 1,
      rightEyeOpen: 1,
    }),
    live2dEyeTrackingEnabled: ref(false),
    live2dEyeFocusSourceActive: ref(false),
    live2dIdleAnimationEnabled: ref(true),
    live2dForceIdleEyeAnimation: ref(false),
    live2dAutoBlinkEnabled: ref(true),
    live2dForceAutoBlinkEnabled: ref(false),
    isIdleMotion: true,
    handled: false as boolean,
    markHandled: vi.fn(() => {
      context.handled = true
    }),
  }

  return Object.assign(context, overrides) as unknown as MotionManagerPluginContext
}

describe('live2d motion manager plugins', () => {
  it('keeps SDK breath from changing AIRI-owned idle parameters', () => {
    const updateParameters = vi.fn()
    const internalModel = {
      breath: { updateParameters },
    }

    // ROOT CAUSE:
    //
    // CubismBreath added periodic head, body, and breath offsets after AIRI's
    // final motion plugins. These late writes made a controlled pose wiggle.
    //
    // We fixed this by removing the SDK breath owner during model setup.
    disableLive2DSdkBreath(internalModel)

    // The SDK runs this optional breath pass after the motion manager.
    internalModel.breath?.updateParameters()

    expect(updateParameters).not.toHaveBeenCalled()
  })

  it('applies manual breath after motion and restores the configured value on release', () => {
    const context = createContext({
      modelParameters: ref({
        breath: 0.2,
        leftEyeOpen: 1,
        rightEyeOpen: 1,
      }),
    })
    const breathControl = ref<Live2DBreathControlState>({
      active: true,
      ownerId: 'motion-devtool',
      startedAtMs: 1_000,
      options: {
        cycleSeconds: 4,
        exhaleDwellSeconds: 0,
        minimum: 0.1,
        maximum: 0.7,
        inhaleRatio: 0.25,
      },
    })
    const plugin = useMotionUpdatePluginBreathControl(breathControl, () => 2_000)

    plugin(context)

    expect(context.model.setParameterValueById).toHaveBeenLastCalledWith('ParamBreath', 0.7)

    breathControl.value = {
      ...breathControl.value,
      active: false,
      ownerId: null,
    }
    plugin(context)

    expect(context.model.setParameterValueById).toHaveBeenLastCalledWith('ParamBreath', 0.2)
  })

  /**
   * @example
   * expect(idleEyeFocus.update).toHaveBeenCalled()
   */
  it('keeps idle eye focus alive when idle motion is disabled', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dIdleAnimationEnabled: ref(false),
      live2dForceIdleEyeAnimation: ref(true),
    })

    useMotionUpdatePluginIdleDisable(idleEyeFocus)(context)

    expect(idleEyeFocus.update).toHaveBeenCalledWith(context.internalModel, context.now)
  })

  /**
   * @example
   * expect(idleEyeFocus.update).not.toHaveBeenCalled()
   */
  it('lets mouse tracking own focus while a tracking source is active', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dEyeTrackingEnabled: ref(true),
      live2dEyeFocusSourceActive: ref(true),
      live2dIdleAnimationEnabled: ref(false),
      live2dForceIdleEyeAnimation: ref(true),
    })

    useMotionUpdatePluginIdleDisable(idleEyeFocus)(context)

    expect(idleEyeFocus.update).not.toHaveBeenCalled()
  })

  /**
   * @example
   * expect(context.internalModel.eyeBlink?.updateParameters).toHaveBeenCalled()
   */
  it('uses the model built-in blink when auto blink is enabled and force blink is disabled', () => {
    const context = createContext({
      live2dAutoBlinkEnabled: ref(true),
      live2dForceAutoBlinkEnabled: ref(false),
    })

    useMotionUpdatePluginAutoEyeBlink(ref(false))(context)

    expect(context.internalModel.eyeBlink?.updateParameters).toHaveBeenCalled()
    expect(context.model.setParameterValueById).toHaveBeenCalledWith('ParamEyeLOpen', 0.5)
    expect(context.model.setParameterValueById).toHaveBeenCalledWith('ParamEyeROpen', 0.25)
    expect(context.handled).toBe(true)
  })

  /**
   * @example
   * expect(context.internalModel.eyeBlink?.updateParameters).not.toHaveBeenCalled()
   */
  it('does not call the model built-in blink when force blink is enabled', () => {
    const context = createContext({
      live2dAutoBlinkEnabled: ref(true),
      live2dForceAutoBlinkEnabled: ref(true),
      timeDelta: 4000,
    })

    useMotionUpdatePluginAutoEyeBlink(ref(false))(context)

    expect(context.internalModel.eyeBlink?.updateParameters).not.toHaveBeenCalled()
    expect(context.handled).toBe(true)
  })

  it('applies force blink after the SDK handles an idle-motion frame', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0)
    const context = createContext({
      live2dAutoBlinkEnabled: ref(true),
      live2dForceAutoBlinkEnabled: ref(true),
      timeDelta: 4,
      handled: true,
    })
    const plugin = useMotionUpdatePluginAutoEyeBlink(ref(false))

    // ROOT CAUSE:
    //
    // The SDK marks normal idle-motion frames as handled. The final blink
    // plug-in returned on handled frames, so force mode never advanced.
    //
    // We fixed this by letting force mode run after an SDK-handled frame.
    plugin(context)
    context.timeDelta = 0.075
    plugin(context)

    expect(context.model.getParameterValueById('ParamEyeLOpen')).toBe(0)
    expect(context.model.getParameterValueById('ParamEyeROpen')).toBe(0)

    randomSpy.mockRestore()
  })

  /**
   * @example
   * expect(context.model.getParameterValueById('ParamEyeLOpen')).toBeLessThan(1)
   */
  it('opens force blink over a randomized 150ms to 300ms duration', () => {
    const randomSpy = vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.5)

    const context = createContext({
      live2dAutoBlinkEnabled: ref(true),
      live2dForceAutoBlinkEnabled: ref(true),
      timeDelta: 3,
    })
    const plugin = useMotionUpdatePluginAutoEyeBlink(ref(false))

    // ROOT CAUSE:
    //
    // Force blink previously reopened at one fixed speed.
    // That made closed eyes feel either too quick or too slow depending on
    // the model's eye-open parameter range.
    //
    // We fixed this by randomizing each opening phase between 150ms and 300ms.
    plugin(context)
    context.timeDelta = 0.075
    context.handled = false
    plugin(context)
    context.timeDelta = 0.15
    context.handled = false
    plugin(context)

    expect(context.model.getParameterValueById('ParamEyeLOpen')).toBeCloseTo(4 / 9)
    expect(context.model.getParameterValueById('ParamEyeROpen')).toBeCloseTo(4 / 9)

    context.timeDelta = 0.075
    context.handled = false
    plugin(context)

    expect(context.model.getParameterValueById('ParamEyeLOpen')).toBe(1)
    expect(context.model.getParameterValueById('ParamEyeROpen')).toBe(1)

    randomSpy.mockRestore()
  })

  it('springs eye, head, and body parameters toward the manual target', () => {
    const context = createContext({ timeDelta: 1 / 60 })
    const spring = createLive2DMotionSpring()

    const plugin = useMotionUpdatePluginManualControl(ref({
      active: true,
      ownerId: 'motion-devtool',
      pose: {
        ...neutralLive2DMotionControlPose,
        eyeX: 0.25,
        eyeY: -0.5,
        headX: 0.5,
        headY: -0.25,
        headZ: -0.75,
        bodyX: -0.5,
        bodyY: 0.75,
        bodyZ: 1,
        mouthForm: -0.25,
      },
      dynamics: { follow: 0.6, inertia: 0.35 },
    }), spring)

    plugin(context)

    const firstAngleX = context.model.getParameterValueById('ParamAngleX')
    expect(firstAngleX).toBeGreaterThan(0)
    expect(firstAngleX).toBeLessThan(15)

    for (let frame = 0; frame < 300; frame += 1)
      plugin(context)

    expect(context.model.getParameterValueById('ParamEyeBallX')).toBeCloseTo(0.25)
    expect(context.model.getParameterValueById('ParamEyeBallY')).toBeCloseTo(-0.5)
    expect(context.model.getParameterValueById('ParamAngleX')).toBeCloseTo(15)
    expect(context.model.getParameterValueById('ParamAngleY')).toBeCloseTo(-7.5)
    expect(context.model.getParameterValueById('ParamAngleZ')).toBeCloseTo(-22.5)
    expect(context.model.getParameterValueById('ParamBodyAngleX')).toBeCloseTo(-5)
    expect(context.model.getParameterValueById('ParamBodyAngleY')).toBeCloseTo(7.5)
    expect(context.model.getParameterValueById('ParamBodyAngleZ')).toBeCloseTo(10)
    expect(context.model.getParameterValueById('ParamMouthForm')).toBeCloseTo(-0.25)
  })

  it('leaves motion parameters unchanged after manual control is released', () => {
    const context = createContext()

    useMotionUpdatePluginManualControl(ref({
      active: false,
      ownerId: null,
      pose: neutralLive2DMotionControlPose,
      dynamics: { follow: 0.6, inertia: 0.35 },
    }), createLive2DMotionSpring())(context)

    expect(context.model.setParameterValueById).not.toHaveBeenCalled()
  })
})

describe('light squint plugin', () => {
  const frameSeconds = 1 / 120

  /** Runs the plugin over `seconds` of frames and returns the final eye value. */
  function run(plugin: ReturnType<typeof useMotionUpdatePluginLightSquint>, seconds: number, context = createContext({ timeDelta: frameSeconds })) {
    for (let frame = 0; frame < Math.round(seconds / frameSeconds); frame += 1)
      plugin(context)
    return context.model.getParameterValueById('ParamEyeLOpen') as number
  }

  it('leaves the eyes open while the screen level holds still', () => {
    // ROOT CAUSE:
    //
    // A squint driven by the screen level itself would hold the eyes narrowed
    // for as long as a bright application is in front, which is the ordinary
    // desktop rather than a rare one, and the character would read as sleepy
    // instead of reacting. The signal is the gap between a fast and a slow
    // follower, so a level that does not move closes the gap and the eyes stay
    // open however bright the screen is.
    const plugin = useMotionUpdatePluginLightSquint(() => 0.95, () => 1)

    expect(run(plugin, 20)).toBe(1)
  })

  it('narrows the eyes when the screen brightens and reopens them after', () => {
    let exposure = 0.15
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 0.5)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 0.85
    const duringChange = run(plugin, 0.6, context)
    expect(duringChange).toBeLessThan(0.85)

    const afterAdapting = run(plugin, 6, context)
    expect(afterAdapting).toBe(1)
  })

  it('opens back on its own schedule instead of trailing the light measurement', () => {
    // ROOT CAUSE:
    //
    // The squint used to be read straight off the follower gap, which decays
    // exponentially. The eyes shot open at first and then sat a few percent
    // short of open for the better part of ten seconds, so the character never
    // looked like it had recovered.
    //
    // The gap now only proposes a depth while it is still opening. The way back
    // is a steady release with a quicker finish, so it reaches fully open at a
    // definite time.
    let exposure = 0
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 1)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 1

    const atPeak = run(plugin, 0.4, context)
    expect(atPeak).toBeLessThan(0.5)
    // Still on the way back one second in, so the recovery is visible.
    expect(run(plugin, 0.6, context)).toBeLessThan(1)
    // And finished a few seconds in, with no tail left behind.
    expect(run(plugin, 4, context)).toBe(1)
  })

  it('never narrows past the floor that keeps the blink plugin running', () => {
    // The blink plugin skips a blink once both eyes sit at or below 0.15, so a
    // squint that reached that far would stop the character blinking.
    let exposure = 0
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 4)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 1

    expect(run(plugin, 0.5, context)).toBeGreaterThanOrEqual(0.2)
  })

  it('leaves eyes that an expression already narrowed past the floor alone', () => {
    // ROOT CAUSE:
    //
    // The floor started out as a floor on the multiplier, so a fully closed eye
    // multiplied by it stayed closed but the written value could still land
    // under the blink threshold once an expression had lowered the base. Worse,
    // a floor applied to the written value alone would widen a deliberately
    // narrowed eye back up to it.
    //
    // The floor is now the smaller of itself and the base, so it can only
    // narrow an eye and never widen one.
    let exposure = 0
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 4)
    const context = createContext({ timeDelta: frameSeconds })
    context.model.setParameterValueById('ParamEyeLOpen', 0.08)
    context.model.setParameterValueById('ParamEyeROpen', 0.08)

    run(plugin, 1, context)
    exposure = 1

    expect(run(plugin, 0.5, context)).toBeCloseTo(0.08, 5)
  })

  it('does not compound its own output when no other plugin writes the eyes', () => {
    // ROOT CAUSE:
    //
    // The plugin multiplies the value it finds on the parameter. On a frame
    // where no motion, blink or expression wrote the eyes, that value is this
    // plugin's own output from the previous frame, so multiplying again
    // compounded every frame and shut the eyes completely within a second.
    //
    // The plugin now remembers what it wrote and resolves a value it recognizes
    // back to the base it came from, so a held squint reaches one depth and
    // stays there.
    let exposure = 0
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 0.5)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 1
    const atPeak = run(plugin, 0.5, context)
    const oneSecondLater = run(plugin, 1, context)

    expect(atPeak).toBeGreaterThan(0.4)
    // Recovery raises the value. Compounding would instead drive it to the floor.
    expect(oneSecondLater).toBeGreaterThan(atPeak)
  })

  it('ignores the light change that moving the window brings', () => {
    // ROOT CAUSE:
    //
    // The measurement reads the desktop behind the window. Dragging the window
    // swaps that desktop for a different one, so the exposure jumped and the
    // character squinted at every window move even though no light had changed.
    //
    // A change of window placement now pins both followers to the level for as
    // long as it takes the new surroundings to settle in, so only light that
    // changes under a window standing still reaches the eyes.
    let exposure = 0
    let placement = '0,0,400,600'
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 1, () => placement)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)

    // A drag: the window moves while the desktop behind it turns bright.
    for (let step = 0; step < 30; step += 1) {
      placement = `${step * 8},0,400,600`
      exposure = Math.min(1, step / 12)
      run(plugin, 0.05, context)
    }

    expect(context.model.setParameterValueById).not.toHaveBeenCalled()
  })

  it('still reacts to light that changes while the window stands still', () => {
    let exposure = 0
    const placement = '0,0,400,600'
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 1, () => placement)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 1

    expect(run(plugin, 0.4, context)).toBeLessThan(0.5)
  })

  it('reacts less to a second brightening that follows a short dark spell', () => {
    // ROOT CAUSE:
    //
    // Both followers moved at one speed, so a few seconds of dark reset the
    // adapted state and the very next brightening drew the same full reflex.
    // A real eye does not work that way: getting used to brighter surroundings
    // takes seconds, while getting used to darker ones runs for minutes, so a
    // short dark spell leaves it still light-adapted and the next brightening
    // barely registers.
    //
    // The adapted follower now falls far slower than it rises, which reproduces
    // that asymmetry and makes the second reflex the weaker one.
    let exposure = 0.15
    const placement = '0,0,400,600'
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 1, () => placement)
    const context = createContext({ timeDelta: frameSeconds })

    function brightenAndMeasure() {
      exposure = 0.85
      let narrowest = 1
      for (let frame = 0; frame < Math.round(6 / frameSeconds); frame += 1) {
        plugin(context)
        narrowest = Math.min(narrowest, context.model.getParameterValueById('ParamEyeLOpen') as number)
      }
      return narrowest
    }

    run(plugin, 3, context)
    const first = brightenAndMeasure()

    exposure = 0.15
    run(plugin, 2, context)
    const second = brightenAndMeasure()

    expect(first).toBeLessThan(0.4)
    // The same change again, and the eyes hold much wider than the first time.
    expect(second).toBeGreaterThan(first + 0.3)
  })

  it('recovers its full reaction after a long enough dark spell', () => {
    let exposure = 0.15
    const placement = '0,0,400,600'
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 1, () => placement)
    const context = createContext({ timeDelta: frameSeconds })

    function brightenAndMeasure() {
      exposure = 0.85
      let narrowest = 1
      for (let frame = 0; frame < Math.round(6 / frameSeconds); frame += 1) {
        plugin(context)
        narrowest = Math.min(narrowest, context.model.getParameterValueById('ParamEyeLOpen') as number)
      }
      return narrowest
    }

    run(plugin, 3, context)
    brightenAndMeasure()

    exposure = 0.15
    run(plugin, 5, context)
    const afterShortDark = brightenAndMeasure()

    exposure = 0.15
    run(plugin, 60, context)
    const afterLongDark = brightenAndMeasure()

    expect(afterLongDark).toBeLessThan(afterShortDark - 0.1)
  })

  it('stays out of the way at zero amount', () => {
    let exposure = 0
    const plugin = useMotionUpdatePluginLightSquint(() => exposure, () => 0)
    const context = createContext({ timeDelta: frameSeconds })

    run(plugin, 1, context)
    exposure = 1
    run(plugin, 2, context)

    expect(context.model.setParameterValueById).not.toHaveBeenCalled()
  })
})
