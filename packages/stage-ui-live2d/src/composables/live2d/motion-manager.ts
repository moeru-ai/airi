import type { Cubism4InternalModel, InternalModel } from 'pixi-live2d-display/cubism4'
import type { Ref } from 'vue'

import type { BeatSyncController } from './beat-sync'
import type { useExpressionController } from './expression-controller'

import { useLive2DIdleEyeFocus } from './animation'

type CubismModel = Cubism4InternalModel['coreModel']
type CubismEyeBlink = Cubism4InternalModel['eyeBlink']

export type PixiLive2DInternalModel = InternalModel & {
  eyeBlink?: CubismEyeBlink
  coreModel: CubismModel
}

export interface MotionManagerUpdateContext {
  model: CubismModel
  now: number
  timeDelta: number
  hookedUpdate?: (model: CubismModel, now: number) => boolean
}

export type MotionManagerPluginContext = MotionManagerUpdateContext & {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  isIdleMotion: boolean
  handled: boolean
  markHandled: () => void
}

export type MotionManagerPlugin = (ctx: MotionManagerPluginContext) => void

export interface UseLive2DMotionManagerUpdateOptions {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  lastUpdateTime: Ref<number>
}

export function useLive2DMotionManagerUpdate(options: UseLive2DMotionManagerUpdateOptions) {
  const {
    internalModel,
    motionManager,
    modelParameters,
    live2dIdleAnimationEnabled,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    lastUpdateTime,
  } = options

  const prePlugins: MotionManagerPlugin[] = []
  const postPlugins: MotionManagerPlugin[] = []
  const finalPlugins: MotionManagerPlugin[] = []

  function register(plugin: MotionManagerPlugin, stage: 'pre' | 'post' | 'final' = 'pre') {
    if (stage === 'pre')
      prePlugins.push(plugin)
    else if (stage === 'final')
      finalPlugins.push(plugin)
    else
      postPlugins.push(plugin)
  }

  function runPlugins(plugins: MotionManagerPlugin[], ctx: MotionManagerPluginContext) {
    for (const plugin of plugins) {
      if (ctx.handled)
        break
      plugin(ctx)
    }
  }

  function hookUpdate(model: CubismModel, now: number, hookedUpdate?: (model: CubismModel, now: number) => boolean) {
    const timeDelta = lastUpdateTime.value ? now - lastUpdateTime.value : 0
    const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
    const isIdleMotion = !motionManager.state.currentGroup
      || motionManager.state.currentGroup === motionManager.groups.idle
      || (!!selectedMotionGroup && motionManager.state.currentGroup === selectedMotionGroup)

    const ctx: MotionManagerPluginContext = {
      model,
      now,
      timeDelta,
      hookedUpdate,
      internalModel,
      motionManager,
      modelParameters,
      live2dIdleAnimationEnabled,
      live2dAutoBlinkEnabled,
      live2dForceAutoBlinkEnabled,
      isIdleMotion,
      handled: false,
      markHandled: () => {
        ctx.handled = true
      },
    }

    runPlugins(prePlugins, ctx)

    if (!ctx.handled && ctx.hookedUpdate) {
      const result = ctx.hookedUpdate.call(motionManager, model, now)
      if (result)
        ctx.handled = true
    }

    runPlugins(postPlugins, ctx)

    // Final plugins always run regardless of handled state (e.g. expression overrides)
    for (const plugin of finalPlugins) {
      plugin(ctx)
    }

    lastUpdateTime.value = now
    return ctx.handled
  }

  return {
    register,
    hookUpdate,
  }
}

// -- Plugins ---------------------------------------------------------------

export function useMotionUpdatePluginBeatSync(beatSync: BeatSyncController): MotionManagerPlugin {
  return (ctx) => {
    beatSync.updateTargets(ctx.now)

    // Semi-implicit Euler approach
    const stiffness = 120 // Higher -> Snappier
    const damping = 16 // Higher -> Less bounce
    const mass = 1

    let paramAngleX = ctx.model.getParameterValueById('ParamAngleX') as number
    let paramAngleY = ctx.model.getParameterValueById('ParamAngleY') as number
    let paramAngleZ = ctx.model.getParameterValueById('ParamAngleZ') as number

    // X
    {
      const target = beatSync.targetX.value
      const pos = paramAngleX
      const vel = beatSync.velocityX.value
      const accel = (stiffness * (target - pos) - damping * vel) / mass
      beatSync.velocityX.value = vel + accel * ctx.timeDelta
      paramAngleX = pos + beatSync.velocityX.value * ctx.timeDelta

      if (Math.abs(target - paramAngleX) < 0.01 && Math.abs(beatSync.velocityX.value) < 0.01) {
        paramAngleX = target
        beatSync.velocityX.value = 0
      }
    }

    // Y
    {
      const target = beatSync.targetY.value
      const pos = paramAngleY
      const vel = beatSync.velocityY.value
      const accel = (stiffness * (target - pos) - damping * vel) / mass
      beatSync.velocityY.value = vel + accel * ctx.timeDelta
      paramAngleY = pos + beatSync.velocityY.value * ctx.timeDelta

      // Snap
      if (Math.abs(target - paramAngleY) < 0.01 && Math.abs(beatSync.velocityY.value) < 0.01) {
        paramAngleY = target
        beatSync.velocityY.value = 0
      }
    }

    // Z
    {
      const target = beatSync.targetZ.value
      const pos = paramAngleZ
      const vel = beatSync.velocityZ.value
      const accel = (stiffness * (target - pos) - damping * vel) / mass
      beatSync.velocityZ.value = vel + accel * ctx.timeDelta
      paramAngleZ = pos + beatSync.velocityZ.value * ctx.timeDelta

      // Snap
      if (Math.abs(target - paramAngleZ) < 0.01 && Math.abs(beatSync.velocityZ.value) < 0.01) {
        paramAngleZ = target
        beatSync.velocityZ.value = 0
      }
    }

    ctx.model.setParameterValueById('ParamAngleX', paramAngleX)
    ctx.model.setParameterValueById('ParamAngleY', paramAngleY)
    ctx.model.setParameterValueById('ParamAngleZ', paramAngleZ)
  }
}

export function useMotionUpdatePluginIdleDisable(idleEyeFocus = useLive2DIdleEyeFocus()): MotionManagerPlugin {
  return (ctx) => {
    if (ctx.handled)
      return

    // Stop idle motions if they're disabled
    if (!ctx.live2dIdleAnimationEnabled.value && ctx.isIdleMotion) {
      ctx.motionManager.stopAllMotions()

      // Still update eye focus and blink even if idle motion is stopped
      idleEyeFocus.update(ctx.internalModel, ctx.now)
      if (ctx.internalModel.eyeBlink != null) {
        ctx.internalModel.eyeBlink.updateParameters(ctx.model, ctx.timeDelta / 1000)
      }

      // Apply manual eye parameters after auto eye blink
      ctx.model.setParameterValueById('ParamEyeLOpen', ctx.modelParameters.value.leftEyeOpen)
      ctx.model.setParameterValueById('ParamEyeROpen', ctx.modelParameters.value.rightEyeOpen)

      ctx.markHandled()
    }
  }
}

export function useMotionUpdatePluginIdleFocus(idleEyeFocus = useLive2DIdleEyeFocus()): MotionManagerPlugin {
  return (ctx) => {
    if (!ctx.isIdleMotion || ctx.handled)
      return

    idleEyeFocus.update(ctx.internalModel, ctx.now)
  }
}

export function useMotionUpdatePluginAutoEyeBlink(
  live2dExpressionEnabled?: Ref<boolean>,
): MotionManagerPlugin {
  const blinkState = {
    phase: 'idle' as 'idle' | 'closing' | 'opening',
    progress: 0,
    startLeft: 1,
    startRight: 1,
    delayMs: 0,
  }

  // Eye values captured at blink start.  Used as the base during
  // closing/opening so that models without eye motion curves don't
  // get stuck at 0 (since 0 × factor = 0 forever).
  let preBlinkLeft = 1.0
  let preBlinkRight = 1.0
  const blinkCloseDuration = 75 // ms
  const blinkOpenDuration = 75 // ms
  const minDelay = 3000
  const maxDelay = 8000

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))

  function resetBlinkState() {
    blinkState.phase = 'idle'
    blinkState.progress = 0
    blinkState.delayMs = minDelay + Math.random() * (maxDelay - minDelay)
  }
  resetBlinkState()

  function easeOutQuad(t: number) {
    return 1 - (1 - t) * (1 - t)
  }
  function easeInQuad(t: number) {
    return t * t
  }

  function updateForcedBlink(dt: number, baseLeft: number, baseRight: number) {
    // Idle: count down delay to next blink.
    if (blinkState.phase === 'idle') {
      blinkState.delayMs = Math.max(0, blinkState.delayMs - dt)
      if (blinkState.delayMs === 0) {
        blinkState.phase = 'closing'
        blinkState.progress = 0
        blinkState.startLeft = baseLeft
        blinkState.startRight = baseRight
      }

      return { eyeLOpen: baseLeft, eyeROpen: baseRight }
    }

    // Closing: move toward zero with ease-out.
    if (blinkState.phase === 'closing') {
      blinkState.progress = Math.min(1, blinkState.progress + dt / blinkCloseDuration)
      const eased = easeOutQuad(blinkState.progress)
      const eyeLOpen = clamp01(blinkState.startLeft * (1 - eased))
      const eyeROpen = clamp01(blinkState.startRight * (1 - eased))

      if (blinkState.progress >= 1) {
        blinkState.phase = 'opening'
        blinkState.progress = 0
      }

      return { eyeLOpen, eyeROpen }
    }

    // Opening: move back to the base with ease-in.
    blinkState.progress = Math.min(1, blinkState.progress + dt / blinkOpenDuration)
    const eased = easeInQuad(blinkState.progress)
    const eyeLOpen = clamp01(blinkState.startLeft * eased)
    const eyeROpen = clamp01(blinkState.startRight * eased)

    if (blinkState.progress >= 1) {
      resetBlinkState()
    }

    return { eyeLOpen, eyeROpen }
  }

  return (ctx) => {
    // ===== EXPRESSION OFF: MAIN-IDENTICAL BEHAVIOR =====
    // When the expression system is disabled, replicate the exact auto-blink
    // logic from main so that hookUpdate returns the same handled state and
    // the SDK eyeBlink/motion pipeline is not disrupted.
    if (!live2dExpressionEnabled?.value) {
      if (!ctx.isIdleMotion || ctx.handled)
        return

      const baseLeft = clamp01(ctx.modelParameters.value.leftEyeOpen)
      const baseRight = clamp01(ctx.modelParameters.value.rightEyeOpen)

      // Auto-blink OFF: absolute write + markHandled (same as main).
      if (!ctx.live2dAutoBlinkEnabled.value) {
        resetBlinkState()
        ctx.model.setParameterValueById('ParamEyeLOpen', baseLeft)
        ctx.model.setParameterValueById('ParamEyeROpen', baseRight)
        ctx.markHandled()
        return
      }

      // Force ON or eyeBlink null: timer blink + markHandled.
      if (ctx.live2dForceAutoBlinkEnabled.value || !ctx.internalModel.eyeBlink) {
        const rawDelta = Math.max(ctx.timeDelta ?? 0, 0)
        const dt = rawDelta < 5 ? rawDelta * 1000 : rawDelta
        const safeDt = dt || 16
        const { eyeLOpen, eyeROpen } = updateForcedBlink(safeDt, baseLeft, baseRight)
        ctx.model.setParameterValueById('ParamEyeLOpen', eyeLOpen)
        ctx.model.setParameterValueById('ParamEyeROpen', eyeROpen)
        ctx.markHandled()
        return
      }

      // SDK eyeBlink path: explicit call → read back → multiply by base → markHandled.
      ctx.internalModel.eyeBlink!.updateParameters(ctx.model, ctx.timeDelta / 1000)
      const blinkLeft = ctx.model.getParameterValueById('ParamEyeLOpen') as number
      const blinkRight = ctx.model.getParameterValueById('ParamEyeROpen') as number
      ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(blinkLeft * baseLeft))
      ctx.model.setParameterValueById('ParamEyeROpen', clamp01(blinkRight * baseRight))
      ctx.markHandled()
      return
    }

    // ===== EXPRESSION ON: MULTIPLY-MODULATE BEHAVIOR =====
    // Run during idle motion only (non-idle motions control eyes via curves).
    if (!ctx.isIdleMotion)
      return

    const baseLeft = clamp01(ctx.modelParameters.value.leftEyeOpen)
    const baseRight = clamp01(ctx.modelParameters.value.rightEyeOpen)

    // Auto-blink OFF: apply manual base values only (multiply with current).
    if (!ctx.live2dAutoBlinkEnabled.value) {
      resetBlinkState()
      const currentLeft = ctx.model.getParameterValueById('ParamEyeLOpen') as number
      const currentRight = ctx.model.getParameterValueById('ParamEyeROpen') as number
      ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(currentLeft * baseLeft))
      ctx.model.setParameterValueById('ParamEyeROpen', clamp01(currentRight * baseRight))
      return
    }

    // Force OFF and SDK eyeBlink alive: should not happen when expression ON
    // (eyeBlink is nullified), but guard defensively — just apply multiplier.
    if (!ctx.live2dForceAutoBlinkEnabled.value && ctx.internalModel.eyeBlink != null) {
      resetBlinkState()
      const currentLeft = ctx.model.getParameterValueById('ParamEyeLOpen') as number
      const currentRight = ctx.model.getParameterValueById('ParamEyeROpen') as number
      ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(currentLeft * baseLeft))
      ctx.model.setParameterValueById('ParamEyeROpen', clamp01(currentRight * baseRight))
      return
    }

    // --- Force Auto Blink: stateful blink for models without idle blink curves ---

    const currentLeft = ctx.model.getParameterValueById('ParamEyeLOpen') as number
    const currentRight = ctx.model.getParameterValueById('ParamEyeROpen') as number

    // Skip blink when eyes are already nearly/fully closed (e.g. by expression).
    const BLINK_THRESHOLD = 0.15
    if (blinkState.phase === 'idle' && currentLeft <= BLINK_THRESHOLD && currentRight <= BLINK_THRESHOLD) {
      resetBlinkState()
      return
    }

    // Track post-expression eye values during idle as the blink baseline.
    if (blinkState.phase === 'idle') {
      preBlinkLeft = currentLeft
      preBlinkRight = currentRight
    }

    // Advance blink timer.
    const wasActive = blinkState.phase !== 'idle'
    const rawDelta = Math.max(ctx.timeDelta ?? 0, 0)
    const dt = rawDelta < 5 ? rawDelta * 1000 : rawDelta
    const safeDt = dt || 16
    const { eyeLOpen: blinkFactorL, eyeROpen: blinkFactorR } = updateForcedBlink(safeDt, 1.0, 1.0)

    // Blink cycle complete: restore exact pre-blink values.
    if (wasActive && blinkState.phase === 'idle') {
      ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(preBlinkLeft * baseLeft))
      ctx.model.setParameterValueById('ParamEyeROpen', clamp01(preBlinkRight * baseRight))
      return
    }

    // Idle: don't write (avoids feedback-loop decay).
    if (blinkState.phase === 'idle')
      return

    // Active blink: saved pre-blink values × blinkFactor.
    ctx.model.setParameterValueById('ParamEyeLOpen', clamp01(preBlinkLeft * blinkFactorL * baseLeft))
    ctx.model.setParameterValueById('ParamEyeROpen', clamp01(preBlinkRight * blinkFactorR * baseRight))
  }
}

/**
 * Post-plugin that applies expression parameter overrides from the expression
 * store onto the Live2D model every frame.
 *
 * This plugin intentionally ignores `ctx.handled` so that expression values
 * are always applied on top of whatever the motion / blink plugins produced.
 * It also does NOT call `ctx.markHandled()` so it never blocks other plugins.
 */
export function useMotionUpdatePluginExpression(
  controller: ReturnType<typeof useExpressionController>,
): MotionManagerPlugin {
  return (ctx) => {
    // Always apply regardless of handled state – expressions layer on top.
    controller.applyExpressions(ctx.model)
  }
}
