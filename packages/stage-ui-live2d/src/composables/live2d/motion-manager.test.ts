import type { MotionManagerPluginContext, PixiLive2DInternalModel } from './motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { createLive2DMotionSpring } from './motion-control-spring'
import {
  disableLive2DSdkBreath,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginIdleDisable,
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
      pose: { x: 0.5, y: -0.25, headZ: -0.75, bodyZ: 1 },
      dynamics: { follow: 0.6, inertia: 0.35 },
    }), spring)

    plugin(context)

    const firstAngleX = context.model.getParameterValueById('ParamAngleX')
    expect(firstAngleX).toBeGreaterThan(0)
    expect(firstAngleX).toBeLessThan(15)

    for (let frame = 0; frame < 300; frame += 1)
      plugin(context)

    expect(context.model.getParameterValueById('ParamEyeBallX')).toBeCloseTo(0.5)
    expect(context.model.getParameterValueById('ParamEyeBallY')).toBeCloseTo(-0.25)
    expect(context.model.getParameterValueById('ParamAngleX')).toBeCloseTo(15)
    expect(context.model.getParameterValueById('ParamAngleY')).toBeCloseTo(-7.5)
    expect(context.model.getParameterValueById('ParamAngleZ')).toBeCloseTo(-22.5)
    expect(context.model.getParameterValueById('ParamBodyAngleX')).toBeCloseTo(5)
    expect(context.model.getParameterValueById('ParamBodyAngleY')).toBeCloseTo(-2.5)
    expect(context.model.getParameterValueById('ParamBodyAngleZ')).toBeCloseTo(10)
  })

  it('leaves motion parameters unchanged after manual control is released', () => {
    const context = createContext()

    useMotionUpdatePluginManualControl(ref({
      active: false,
      ownerId: null,
      pose: { x: 0, y: 0, headZ: 0, bodyZ: 0 },
      dynamics: { follow: 0.6, inertia: 0.35 },
    }), createLive2DMotionSpring())(context)

    expect(context.model.setParameterValueById).not.toHaveBeenCalled()
  })
})
