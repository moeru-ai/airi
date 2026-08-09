// @vitest-environment jsdom
// hookUpdate reads the selected runtime motion group from localStorage.

import type { MotionManagerPluginContext, PixiLive2DInternalModel } from './motion-manager'

import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import {
  resolveIdleMotionGroup,
  useLive2DMotionManagerUpdate,
  useMotionUpdatePluginAutoEyeBlink,
  useMotionUpdatePluginIdleDisable,
  useMotionUpdatePluginIdleFocus,
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
    nowMs: 1000,
    deltaMs: 16,
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

describe('idle motion group detection', () => {
  it('matches the separator forms Cubism 2 archives ship', () => {
    // ROOT CAUSE:
    //
    // The detector was `/^idle\d*$/i`, which rejects the underscored `idle_01`
    // that the comment beside it already listed as a supported spelling. Those
    // archives kept the SDK default in `motionManager.groups.idle`, so once the
    // shipped idle motion started, `useLive2DMotionManagerUpdate` computed
    // isIdleMotion === false and skipped every idle-gated plugin: idle gaze,
    // forced blinking, and idle-disable handling.
    //
    // We fixed this by allowing an optional `-`/`_` before the index.
    expect(resolveIdleMotionGroup({ idle_01: [] })).toBe('idle_01')
    expect(resolveIdleMotionGroup({ 'idle-01': [] })).toBe('idle-01')
    expect(resolveIdleMotionGroup({ idle01: [] })).toBe('idle01')
    expect(resolveIdleMotionGroup({ Idle: [] })).toBe('Idle')
  })

  it('leaves the SDK default in place when no group looks like an idle group', () => {
    expect(resolveIdleMotionGroup({ tap_body: [], idlest: [] })).toBeUndefined()
  })
})

describe('live2d motion manager plugins', () => {
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

    expect(idleEyeFocus.update).toHaveBeenCalledWith(context.internalModel, context.nowMs)
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
      deltaMs: 4000,
    })

    useMotionUpdatePluginAutoEyeBlink(ref(false))(context)

    expect(context.internalModel.eyeBlink?.updateParameters).not.toHaveBeenCalled()
    expect(context.handled).toBe(true)
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
      // Burns down the mocked 3000ms idle delay so the first call starts closing.
      deltaMs: 3000,
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
    context.deltaMs = 75
    context.handled = false
    plugin(context)
    context.deltaMs = 150
    context.handled = false
    plugin(context)

    expect(context.model.getParameterValueById('ParamEyeLOpen')).toBeCloseTo(4 / 9)
    expect(context.model.getParameterValueById('ParamEyeROpen')).toBeCloseTo(4 / 9)

    context.deltaMs = 75
    context.handled = false
    plugin(context)

    expect(context.model.getParameterValueById('ParamEyeLOpen')).toBe(1)
    expect(context.model.getParameterValueById('ParamEyeROpen')).toBe(1)

    randomSpy.mockRestore()
  })
})

describe('useMotionUpdatePluginIdleFocus', () => {
  // ROOT CAUSE:
  //
  // Idle eye focus used to be registered in the 'post' stage and bail out on
  // ctx.handled. hookUpdate marks handled as soon as the SDK motion update
  // reports that it wrote parameters, which is every frame an idle motion
  // plays, so the saccade almost never reached the model and the idle motion's
  // own ParamEyeBall curves owned the eyes.
  //
  //   if (!ctx.isIdleMotion || ctx.handled)
  //     return
  //
  // We fixed this by registering the plugin in the 'final' stage, which ignores
  // handled, and replacing the handled guard with the idle-animation-disabled
  // guard that useMotionUpdatePluginIdleDisable already owns.
  //
  //   if (!ctx.isIdleMotion)
  //     return
  //   if (!ctx.live2dIdleAnimationEnabled.value)
  //     return
  it('runs idle eye focus while an idle motion is already updating parameters', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dForceIdleEyeAnimation: ref(true),
      handled: true,
    })

    useMotionUpdatePluginIdleFocus(idleEyeFocus)(context)

    expect(idleEyeFocus.update).toHaveBeenCalledTimes(1)
    expect(idleEyeFocus.update).toHaveBeenCalledWith(context.internalModel, context.nowMs)
  })

  it('runs idle eye focus on frames where no motion updated parameters', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dForceIdleEyeAnimation: ref(true),
      handled: false,
    })

    useMotionUpdatePluginIdleFocus(idleEyeFocus)(context)

    expect(idleEyeFocus.update).toHaveBeenCalledTimes(1)
    expect(idleEyeFocus.update).toHaveBeenCalledWith(context.internalModel, context.nowMs)
  })

  it('leaves the eyes to a non-idle motion regardless of the handled state', () => {
    const idleEyeFocus = { update: vi.fn() }
    const handledContext = createContext({
      live2dForceIdleEyeAnimation: ref(true),
      isIdleMotion: false,
      handled: true,
    })
    const unhandledContext = createContext({
      live2dForceIdleEyeAnimation: ref(true),
      isIdleMotion: false,
      handled: false,
    })

    useMotionUpdatePluginIdleFocus(idleEyeFocus)(handledContext)
    useMotionUpdatePluginIdleFocus(idleEyeFocus)(unhandledContext)

    expect(idleEyeFocus.update).not.toHaveBeenCalled()
  })

  it('hands the idle-animation-disabled case to useMotionUpdatePluginIdleDisable instead of saccading twice', () => {
    // Both plugins default to their own useLive2DIdleEyeFocus instance, so a
    // double call would run two competing saccade schedules against one model.
    const idleDisableEyeFocus = { update: vi.fn() }
    const idleFocusEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dIdleAnimationEnabled: ref(false),
      live2dForceIdleEyeAnimation: ref(true),
    })

    useMotionUpdatePluginIdleDisable(idleDisableEyeFocus)(context)
    useMotionUpdatePluginIdleFocus(idleFocusEyeFocus)(context)

    expect(idleDisableEyeFocus.update).toHaveBeenCalledTimes(1)
    expect(idleFocusEyeFocus.update).not.toHaveBeenCalled()
  })

  it('skips idle eye focus when forced idle eye animation is off', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dForceIdleEyeAnimation: ref(false),
      handled: true,
    })

    useMotionUpdatePluginIdleFocus(idleEyeFocus)(context)

    expect(idleEyeFocus.update).not.toHaveBeenCalled()
  })

  it('yields to eye tracking while a tracking source is active', () => {
    const idleEyeFocus = { update: vi.fn() }
    const context = createContext({
      live2dForceIdleEyeAnimation: ref(true),
      live2dEyeTrackingEnabled: ref(true),
      live2dEyeFocusSourceActive: ref(true),
      handled: true,
    })

    useMotionUpdatePluginIdleFocus(idleEyeFocus)(context)

    expect(idleEyeFocus.update).not.toHaveBeenCalled()
  })
})

describe('useLive2DMotionManagerUpdate frame timing', () => {
  /** Discriminated by `getParamFloat`/`setParamFloat`, the legacy core's accessors. */
  const cubism2CoreModel = () => ({ getParamFloat: vi.fn(() => 0), setParamFloat: vi.fn() })
  const cubism4CoreModel = () => ({ getParameterValueById: vi.fn(() => 0), setParameterValueById: vi.fn() })

  function captureContexts(coreModel: object) {
    const contexts: Array<{ nowMs: number, deltaMs: number }> = []
    const { register, hookUpdate } = useLive2DMotionManagerUpdate({
      internalModel: { coreModel, eyeBlink: null } as unknown as PixiLive2DInternalModel,
      motionManager: {
        state: { currentGroup: undefined },
        groups: { idle: 'Idle' },
      } as unknown as PixiLive2DInternalModel['motionManager'],
      modelParameters: ref({}),
      live2dEyeTrackingEnabled: ref(false),
      live2dEyeFocusSourceActive: ref(false),
      live2dIdleAnimationEnabled: ref(true),
      live2dForceIdleEyeAnimation: ref(false),
      live2dAutoBlinkEnabled: ref(false),
      live2dForceAutoBlinkEnabled: ref(false),
      lastUpdateAtMs: ref(0),
    })

    register(ctx => void contexts.push({ nowMs: ctx.nowMs, deltaMs: ctx.deltaMs }), 'pre')

    return { contexts, hookUpdate: (now: number) => hookUpdate(coreModel as never, now) }
  }

  // ROOT CAUSE:
  //
  // `motionManager.update(model, now)` is handed elapsed milliseconds on
  // Cubism 2 but elapsed seconds on Cubism 4: `Cubism4InternalModel.update` runs
  // `dt /= 1e3; now /= 1e3` before delegating, `Cubism2InternalModel.update`
  // forwards the raw values. AIRI hooks that one method for both generations, and
  // every timing constant behind it had been calibrated against the Cubism 4
  // seconds:
  //
  //   nextSaccadeAfter = now + (randomSaccadeInterval() / 1000)
  //   const safeDt = ctx.timeDelta * 1000 || 16
  //   releaseRemainingMs -= ctx.timeDelta * 1000
  //
  // On a Cubism 2 model that turned an ~800ms saccade interval into ~0.8ms, so a
  // new gaze target was picked almost every frame; `updateFocus()` then folds the
  // focus controller into the head and body angles as well as the eyeballs, which
  // is why idle "eye" movement shook the head. The forced-blink and lip-sync
  // timers ran 1000x fast for the same reason.
  //
  // We fixed this by normalizing `now` to milliseconds once in `hookUpdate`, so
  // plugins only ever see `ctx.nowMs` / `ctx.deltaMs`.
  it('reports the same milliseconds to plugins on both Cubism generations', () => {
    const cubism2 = captureContexts(cubism2CoreModel())
    // Cubism 2 forwards `elapsedTime` untouched.
    cubism2.hookUpdate(1000)
    cubism2.hookUpdate(1016.5)

    const cubism4 = captureContexts(cubism4CoreModel())
    // Cubism 4 divides the same `elapsedTime` by 1000 before delegating.
    cubism4.hookUpdate(1)
    cubism4.hookUpdate(1.0165)

    expect(cubism2.contexts[0].nowMs).toBeCloseTo(1000)
    expect(cubism2.contexts[1].nowMs).toBeCloseTo(1016.5)
    expect(cubism4.contexts[0].nowMs).toBeCloseTo(1000)
    expect(cubism4.contexts[1].nowMs).toBeCloseTo(1016.5)

    // One ~60fps frame, reported identically regardless of generation.
    expect(cubism2.contexts[1].deltaMs).toBeCloseTo(16.5)
    expect(cubism4.contexts[1].deltaMs).toBeCloseTo(16.5)
  })

  it('reports a zero delta on the first frame instead of the whole elapsed time', () => {
    const { contexts, hookUpdate } = captureContexts(cubism2CoreModel())

    hookUpdate(1000)

    expect(contexts[0].deltaMs).toBe(0)
  })
})
