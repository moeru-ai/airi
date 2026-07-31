import type { Ref } from 'vue'

import type { MotionManagerPlugin, MotionManagerPluginContext } from './motion-manager'

/**
 * The reading this overlay consumes.
 *
 * Declared structurally rather than imported from `@proj-airi/stage-ui`, which
 * already depends on this package — taking the dependency the other way would
 * close a cycle. Any producer of these three axes fits, which is also what
 * keeps the emotional state renderer-agnostic.
 */
export interface EmotionOverlayInput {
  valence: number
  arousal: number
  dominance: number
}

/**
 * Per-axis contribution to one Cubism parameter.
 *
 * Kept as data so the whole mapping is readable in one place, and so it can be
 * tested without a model.
 */
interface OverlayBinding {
  parameterId: string
  valence?: number
  arousal?: number
  dominance?: number
}

/**
 * How the continuous state reaches the rig.
 *
 * Every gain is small on purpose. This layer is a mood floor that colours
 * whatever the motion is already doing — it is not a performance, and it must
 * never be able to overpower an authored expression.
 *
 * `ParamMouthOpenY` is deliberately absent: mouth aperture belongs to lipsync,
 * which runs later and would fight anything written here. Only mouth *shape*
 * is touched.
 */
const OVERLAY_BINDINGS: readonly OverlayBinding[] = [
  // Pleasantness reads mostly at the mouth corners.
  { parameterId: 'ParamMouthForm', valence: 0.22 },
  // Brows carry both how pleasant and how activated the state is; a raised
  // inner brow on negative valence is what makes sadness legible at all.
  { parameterId: 'ParamBrowLY', valence: 0.12, arousal: 0.08 },
  { parameterId: 'ParamBrowRY', valence: 0.12, arousal: 0.08 },
  // Arousal widens the eyes slightly. Small, because auto-blink also writes
  // here and a large offset would visibly fight it.
  { parameterId: 'ParamEyeLOpen', arousal: 0.10 },
  { parameterId: 'ParamEyeROpen', arousal: 0.10 },
  // Dominance rides the head: chin up when in control, down when withdrawing.
  { parameterId: 'ParamAngleY', dominance: 6 },
] as const

/** Ceiling on any single parameter's offset, in that parameter's own units. */
const MAX_ABS_OFFSET = 0.25
/** `ParamAngle*` is in degrees, so it needs its own, larger ceiling. */
const MAX_ABS_ANGLE_OFFSET = 8

function clamp(value: number, limit: number): number {
  return Math.min(Math.max(value, -limit), limit)
}

/**
 * Turns one emotional state into additive parameter offsets.
 *
 * Before:
 * - `{ valence: 0.5, arousal: 0, dominance: 0 }`
 *
 * After:
 * - `{ ParamMouthForm: 0.11, ParamBrowLY: 0.06, ParamBrowRY: 0.06 }`
 *
 * Offsets are additive, so a parameter absent from the result simply means the
 * state has no opinion about it this frame.
 */
export function resolveEmotionOffsets(vad: EmotionOverlayInput): Record<string, number> {
  const offsets: Record<string, number> = {}

  for (const binding of OVERLAY_BINDINGS) {
    const raw
      = vad.valence * (binding.valence ?? 0)
        + vad.arousal * (binding.arousal ?? 0)
        + vad.dominance * (binding.dominance ?? 0)

    if (raw === 0)
      continue

    const limit = binding.parameterId.startsWith('ParamAngle') ? MAX_ABS_ANGLE_OFFSET : MAX_ABS_OFFSET
    offsets[binding.parameterId] = clamp(raw, limit)
  }

  return offsets
}

export interface EmotionOverlayOptions {
  snapshot: Ref<{ current: EmotionOverlayInput }>
  /** Lets the overlay be switched off without unregistering it. @default always on */
  enabled?: Ref<boolean>
}

/**
 * Applies the continuous emotional state to the model as small additive
 * offsets, on top of whatever motion and expressions produced this frame.
 *
 * Register on the `final` stage: those run unconditionally, so the mood floor
 * survives a frame that another plugin has marked handled, and it lands after
 * the native motion update rather than being overwritten by it.
 *
 * A parameter the model does not declare is skipped rather than written, so a
 * rig missing brow parameters degrades to no brow contribution instead of
 * throwing.
 *
 * @example
 * ```ts
 * const state = createEmotionState()
 * register(createEmotionOverlayPlugin({ snapshot: state.snapshot }), 'final')
 * ```
 */
export function createEmotionOverlayPlugin(options: EmotionOverlayOptions): MotionManagerPlugin {
  const { snapshot, enabled } = options

  /**
   * What this overlay wrote last frame, and the value it was built on.
   *
   * NOTICE:
   * A parameter no motion keys is not reset between frames — the expression
   * controller documents the same behaviour and solves it by writing from a
   * stored default. Without this record, reading the parameter back would
   * return this overlay's own previous output and the offset would compound
   * every frame: a 0.11 mouth offset reaches 6.6 within a second at 60fps.
   *
   * So the readback is only trusted when something else has changed it. If it
   * still equals what was written, the frame has no opinion of its own and the
   * recorded base is used instead.
   */
  const applied = new Map<string, { written: number, base: number }>()

  return (ctx: MotionManagerPluginContext) => {
    const coreModel = ctx.model
    if (!coreModel)
      return

    // Disabled produces an empty set rather than returning early, so the
    // restore pass below still runs and the last offset does not stay stuck on
    // the model.
    const offsets = enabled && !enabled.value
      ? {}
      : resolveEmotionOffsets(snapshot.value.current)

    for (const parameterId of [...applied.keys()]) {
      if (parameterId in offsets)
        continue

      const prev = applied.get(parameterId)!
      const currentValue = coreModel.getParameterValueById(parameterId) as number
      // Only undo the contribution if nothing else has claimed the parameter
      // since; otherwise the newer value is the one that should stand.
      if (Number.isFinite(currentValue) && Object.is(currentValue, prev.written))
        coreModel.setParameterValueById(parameterId, prev.base)

      applied.delete(parameterId)
    }

    for (const [parameterId, offset] of Object.entries(offsets)) {
      // NOTICE:
      // Cubism returns 0 and warns for an unknown parameter id rather than
      // throwing, which would silently bake a wrong baseline into the model.
      // `getParameterIndex` is the cheap way to ask whether the rig actually
      // declares this parameter; guarded because the mock models used in tests
      // do not implement it.
      const index = typeof coreModel.getParameterIndex === 'function'
        ? coreModel.getParameterIndex(parameterId)
        : 0
      if (index < 0)
        continue

      const currentValue = coreModel.getParameterValueById(parameterId) as number
      if (!Number.isFinite(currentValue))
        continue

      const prev = applied.get(parameterId)
      const base = prev !== undefined && Object.is(currentValue, prev.written)
        ? prev.base
        : currentValue

      const next = base + offset
      coreModel.setParameterValueById(parameterId, next)
      applied.set(parameterId, { written: next, base })
    }
  }
}
