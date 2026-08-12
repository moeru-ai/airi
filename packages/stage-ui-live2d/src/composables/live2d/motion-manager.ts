import type { Cubism4InternalModel, InternalModel } from 'pixi-live2d-display'
import type { Ref } from 'vue'

import type { BeatSyncController } from './beat-sync'
import type { useExpressionController } from './expression-controller'

import { loaderForModel } from '../../generations/loader'
import { useLive2DIdleEyeFocus } from './animation'

type CubismModel = Cubism4InternalModel['coreModel']
type CubismEyeBlink = Cubism4InternalModel['eyeBlink']

export type PixiLive2DInternalModel = InternalModel & {
  eyeBlink?: CubismEyeBlink
  coreModel: CubismModel
}

export interface MotionManagerUpdateContext {
  model: CubismModel
  /**
   * Elapsed model time in milliseconds, normalized from whatever unit this
   * model's generation reports (see {@link useLive2DMotionManagerUpdate}).
   *
   * Model-relative, not page-relative. `Live2DModel.elapsedTime` seeds from
   * `performance.now()` but only advances once the model finishes loading and
   * joins the shared ticker, and each frame adds a `Ticker.deltaMS` clamped to
   * `maxElapsedMS`. It is monotonic and every plugin sees the same value, so it
   * is fine for scheduling *within* the frame loop; it must never be compared
   * against a timestamp taken outside it.
   */
  nowMs: number
  /** Time since the previous hooked frame, in milliseconds. `0` on the first frame. */
  deltaMs: number
  hookedUpdate?: (model: CubismModel, now: number) => boolean
}

export type MotionManagerPluginContext = MotionManagerUpdateContext & {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dEyeTrackingEnabled: Ref<boolean>
  live2dEyeFocusSourceActive: Ref<boolean>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dForceIdleEyeAnimation: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  isIdleMotion: boolean
  handled: boolean
  markHandled: () => void
}

export type MotionManagerPlugin = (ctx: MotionManagerPluginContext) => void

/**
 * Picks the motion group a model actually idles on, given its motion definitions.
 *
 * Cubism 2 archives name the group freely — `idle`, `Idle`, `idle01`, `idle_01`
 * — while the SDK only ever looks up the single name held in
 * `motionManager.groups.idle`. Every idle-gated plugin below keys off that
 * lookup through `ctx.isIdleMotion`, so a model whose group is spelled
 * differently reads as permanently non-idle: no idle gaze, no forced blink, no
 * idle-disable handling.
 *
 * Returns `undefined` when nothing matches, which leaves the SDK default in place.
 */
export function resolveIdleMotionGroup(definitions: Record<string, unknown>): string | undefined {
  // The separator is optional because both `idle01` and `idle_01` ship in the
  // wild; the trailing digits are optional because a bare `idle` is the most
  // common spelling of all.
  return Object.keys(definitions).find(group => /^idle[-_]?\d*$/i.test(group))
}

export interface UseLive2DMotionManagerUpdateOptions {
  internalModel: PixiLive2DInternalModel
  motionManager: PixiLive2DInternalModel['motionManager']
  modelParameters: Ref<any>
  live2dEyeTrackingEnabled: Ref<boolean>
  live2dEyeFocusSourceActive: Ref<boolean>
  live2dIdleAnimationEnabled: Ref<boolean>
  live2dForceIdleEyeAnimation: Ref<boolean>
  live2dAutoBlinkEnabled: Ref<boolean>
  live2dForceAutoBlinkEnabled: Ref<boolean>
  /** Owned by the caller so it survives plugin re-registration across model reloads. */
  lastUpdateAtMs: Ref<number>
}

/**
 * Wraps `motionManager.update` so AIRI plugins can read and write model
 * parameters around the SDK's own motion pass.
 *
 * Plugins run in three stages: `pre` (before the SDK update, may claim the frame
 * via `markHandled`), `post` (after it, skipped once the frame is claimed), and
 * `final` (after it, always runs). All three receive the same context, and every
 * timing value on that context is milliseconds regardless of Cubism generation.
 */
export function useLive2DMotionManagerUpdate(options: UseLive2DMotionManagerUpdateOptions) {
  const {
    internalModel,
    motionManager,
    modelParameters,
    live2dEyeTrackingEnabled,
    live2dEyeFocusSourceActive,
    live2dIdleAnimationEnabled,
    live2dForceIdleEyeAnimation,
    live2dAutoBlinkEnabled,
    live2dForceAutoBlinkEnabled,
    lastUpdateAtMs,
  } = options

  // NOTICE:
  // `motionManager.update(model, now)` is handed elapsed *milliseconds* on
  // Cubism 2 but elapsed *seconds* on Cubism 4: `Cubism4InternalModel.update`
  // runs `dt /= 1e3; now /= 1e3` before delegating, while
  // `Cubism2InternalModel.update` forwards the values it received from
  // `Live2DModel._render` untouched.
  //
  // Every constant in the plugins below was originally calibrated against the
  // Cubism 4 seconds, which made each of them 1000x off once the same hook
  // started serving Cubism 2 models. Normalizing once here keeps that decision
  // in one place instead of asking every plugin to guess its own unit.
  //
  // Source/context: `node_modules/pixi-live2d-display/dist/cubism4.es.js` and
  // `dist/cubism2.es.js`, both `update(dt, now)`.
  //
  // Removal condition: upstream passes the same unit to both generations.
  const generationLoader = loaderForModel(internalModel)

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
    const nowMs = generationLoader.runtimeTimeToMilliseconds(now)
    const deltaMs = lastUpdateAtMs.value ? nowMs - lastUpdateAtMs.value : 0
    const selectedMotionGroup = localStorage.getItem('selected-runtime-motion-group')
    const isIdleMotion = !motionManager.state.currentGroup
      || motionManager.state.currentGroup === motionManager.groups.idle
      || (!!selectedMotionGroup && motionManager.state.currentGroup === selectedMotionGroup)

    const ctx: MotionManagerPluginContext = {
      model,
      nowMs,
      deltaMs,
      hookedUpdate,
      internalModel,
      motionManager,
      modelParameters,
      live2dEyeTrackingEnabled,
      live2dEyeFocusSourceActive,
      live2dIdleAnimationEnabled,
      live2dForceIdleEyeAnimation,
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

    lastUpdateAtMs.value = nowMs
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
    // Beat segments are stamped by `scheduleBeat` off the audio pipeline, on the
    // page clock the controller owns; evaluating them has to read that same
    // clock. `ctx.nowMs` is the model's own elapsed time, which trails page time
    // by the model's load duration plus every clamped frame since, so segment
    // starts would sit permanently in its future and the head would never move.
    beatSync.updateTargets()

    // Semi-implicit Euler approach
    const stiffness = 120 // Higher -> Snappier
    const damping = 16 // Higher -> Less bounce
    const mass = 1
    // The spring integrates against the render loop, so it keeps using the
    // generation-normalized frame delta rather than the beat clock. Both
    // coefficients are per-second, so the step has to be seconds too:
    // integrating with a millisecond step puts it far past the explicit-Euler
    // stability limit (~2/sqrt(stiffness) = 0.18s) and it diverges within a
    // couple of frames instead of settling on the target.
    const dt = ctx.deltaMs / 1000

    let paramAngleX = ctx.model.getParameterValueById('ParamAngleX') as number
    let paramAngleY = ctx.model.getParameterValueById('ParamAngleY') as number
    let paramAngleZ = ctx.model.getParameterValueById('ParamAngleZ') as number

    // X
    {
      const target = beatSync.targetX.value
      const pos = paramAngleX
      const vel = beatSync.velocityX.value
      const accel = (stiffness * (target - pos) - damping * vel) / mass
      beatSync.velocityX.value = vel + accel * dt
      paramAngleX = pos + beatSync.velocityX.value * dt

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
      beatSync.velocityY.value = vel + accel * dt
      paramAngleY = pos + beatSync.velocityY.value * dt

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
      beatSync.velocityZ.value = vel + accel * dt
      paramAngleZ = pos + beatSync.velocityZ.value * dt

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

      if (ctx.live2dForceIdleEyeAnimation.value && (!ctx.live2dEyeTrackingEnabled.value || !ctx.live2dEyeFocusSourceActive.value))
        idleEyeFocus.update(ctx.internalModel, ctx.nowMs)
      // Only Cubism 4 reaches this: `adaptInternalModel` nulls the unusable
      // Cubism 2 blink. `CubismEyeBlink.updateParameters` takes seconds.
      if (ctx.internalModel.eyeBlink != null) {
        ctx.internalModel.eyeBlink.updateParameters(ctx.model, ctx.deltaMs / 1000)
      }

      // Apply manual eye parameters after auto eye blink
      ctx.model.setParameterValueById('ParamEyeLOpen', ctx.modelParameters.value.leftEyeOpen)
      ctx.model.setParameterValueById('ParamEyeROpen', ctx.modelParameters.value.rightEyeOpen)

      ctx.markHandled()
    }
  }
}

/**
 * Drives idle eye saccades, and through `internalModel.focusController` the head
 * sway the SDK derives from them.
 *
 * Register this in the `final` phase. It deliberately ignores `ctx.handled`,
 * which is set for every frame an idle motion actually updates parameters, so
 * the saccade schedule keeps advancing while an idle motion plays instead of
 * stalling until the motion queue happens to go quiet.
 *
 * The plugin only retargets the focus controller; both generations apply
 * `updateFocus()` additively once `motionManager.update` returns
 * (`Cubism2InternalModel.update` and `Cubism4InternalModel.update`), so the
 * gaze lands on top of the idle motion's own curves the same way on each.
 */
export function useMotionUpdatePluginIdleFocus(idleEyeFocus = useLive2DIdleEyeFocus()): MotionManagerPlugin {
  return (ctx) => {
    if (!ctx.isIdleMotion)
      return
    // Idle animation being off is `useMotionUpdatePluginIdleDisable`'s branch: it
    // stops the motion queue and calls idle focus itself. Running here as well
    // would drive a second, competing saccade schedule against the same model.
    if (!ctx.live2dIdleAnimationEnabled.value)
      return
    if (!ctx.live2dForceIdleEyeAnimation.value)
      return
    if (ctx.live2dEyeTrackingEnabled.value && ctx.live2dEyeFocusSourceActive.value)
      return

    idleEyeFocus.update(ctx.internalModel, ctx.nowMs)
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
    openDurationMs: 300,
  }

  // Eye values captured at blink start.  Used as the base during
  // closing/opening so that models without eye motion curves don't
  // get stuck at 0 (since 0 × factor = 0 forever).
  let preBlinkLeft = 1.0
  let preBlinkRight = 1.0
  const blinkCloseDuration = 75 // ms
  const minBlinkOpenDuration = 150 // ms
  const maxBlinkOpenDuration = 300 // ms
  const minDelay = 3000
  const maxDelay = 8000

  const clamp01 = (value: number) => Math.min(1, Math.max(0, value))
  const randomBlinkOpenDuration = () => minBlinkOpenDuration + Math.random() * (maxBlinkOpenDuration - minBlinkOpenDuration)

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
        blinkState.openDurationMs = randomBlinkOpenDuration()
      }

      return { eyeLOpen, eyeROpen }
    }

    // Opening: move back to the base with ease-in.
    blinkState.progress = Math.min(1, blinkState.progress + dt / blinkState.openDurationMs)
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
        const safeDtMs = ctx.deltaMs || 16
        const { eyeLOpen, eyeROpen } = updateForcedBlink(safeDtMs, baseLeft, baseRight)
        ctx.model.setParameterValueById('ParamEyeLOpen', eyeLOpen)
        ctx.model.setParameterValueById('ParamEyeROpen', eyeROpen)
        ctx.markHandled()
        return
      }

      // SDK eyeBlink path: explicit call → read back → multiply by base → markHandled.
      ctx.internalModel.eyeBlink!.updateParameters(ctx.model, ctx.deltaMs / 1000)
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
    const safeDtMs = ctx.deltaMs || 16
    const { eyeLOpen: blinkFactorL, eyeROpen: blinkFactorR } = updateForcedBlink(safeDtMs, 1.0, 1.0)

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

/**
 * Final-phase plugin that owns ParamMouthOpenY while speech is active and
 * smoothly cross-fades back to the motion-driven value when speech ends.
 *
 * `nowSpeaking` (not `mouthOpenSize > 0`) is the speech boundary, so silent
 * gaps between phonemes write 0 directly instead of triggering the release.
 *
 * After the release tail elapses, the plugin keeps forcing ParamMouthOpenY to 0
 * for a short handoff hold (HANDOFF_HOLD_MS) before handing control back to
 * motion/expression plugins. This reliably closes the mouth after speech even
 * when an idle motion curve leaves a non-zero resting value, while still
 * letting idle mouth expressions take over shortly after speech ends (rather
 * than overriding them forever).
 */
export function useMotionUpdatePluginLipSync(
  mouthOpenSize: Ref<number>,
  nowSpeaking: Ref<boolean>,
): MotionManagerPlugin {
  // 200 ms covers a typical phoneme tail without lagging behind the next utterance.
  const RELEASE_DURATION_MS = 200
  // After the release tail, keep forcing the mouth shut for this long before
  // handing control back to motion/expression plugins. This guarantees the
  // mouth actually closes even on the first idle frame, where a non-zero
  // resting motion curve would otherwise reopen it immediately.
  const HANDOFF_HOLD_MS = 500

  let releaseRemainingMs = 0
  let handoffRemainingMs = 0
  let lastForcedValue = 0

  // Smoothstep: 3t^2 - 2t^3, eases in/out with zero slope at endpoints.
  const smoothstep = (t: number) => t * t * (3 - 2 * t)

  return (ctx) => {
    if (nowSpeaking.value) {
      lastForcedValue = mouthOpenSize.value
      releaseRemainingMs = RELEASE_DURATION_MS
      handoffRemainingMs = HANDOFF_HOLD_MS
      ctx.model.setParameterValueById('ParamMouthOpenY', mouthOpenSize.value)
      return
    }

    if (releaseRemainingMs <= 0) {
      if (handoffRemainingMs > 0) {
        // Release tail elapsed. Keep forcing the mouth shut through the handoff
        // hold so a non-zero idle motion curve cannot reopen it on the first
        // idle frame. After the hold we stop owning the parameter and let
        // motion/expression plugins drive it again.
        handoffRemainingMs = Math.max(0, handoffRemainingMs - ctx.deltaMs)
        ctx.model.setParameterValueById('ParamMouthOpenY', 0)
      }
      return
    }

    releaseRemainingMs = Math.max(0, releaseRemainingMs - ctx.deltaMs)
    const blend = smoothstep(1 - releaseRemainingMs / RELEASE_DURATION_MS)

    // ParamMouthOpenY was already written by motion + expression plugins this frame.
    const motionValue = ctx.model.getParameterValueById('ParamMouthOpenY') as number
    const blended = lastForcedValue * (1 - blend) + motionValue * blend

    ctx.model.setParameterValueById('ParamMouthOpenY', blended)
  }
}
