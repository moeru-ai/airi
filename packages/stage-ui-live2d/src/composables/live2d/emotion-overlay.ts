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
  /** Reads the state for the current frame. Called once per frame, in `apply`. */
  reading: () => EmotionOverlayInput
  /** Lets the overlay be switched off without unregistering it. @default always on */
  enabled?: () => boolean
}

/**
 * The two halves of the overlay. Both must be registered, and `restore` must be
 * the first `pre` plugin — a `pre` plugin that marks the frame handled stops
 * the ones after it, and skipping the restore would leave the previous frame's
 * offset baked into the base.
 */
export interface EmotionOverlayPlugins {
  /** Register on `pre`, before any other pre plugin. */
  restore: MotionManagerPlugin
  /** Register on `final`. */
  apply: MotionManagerPlugin
}

/**
 * Applies the continuous emotional state to the model as small additive
 * offsets, layered on whatever motion and expressions produced this frame.
 *
 * Split across two stages on purpose. A parameter no motion keys is not reset
 * between frames, so a single-stage overlay would read back its own previous
 * output and compound the offset every frame. Comparing the readback against
 * what was written cannot fix that reliably either: the model clamps, and two
 * writers can land on the same value, so equality answers neither "did anyone
 * else write this" nor "is this still mine".
 *
 * Undoing the contribution in `pre` removes the question. Nothing else has run
 * yet that frame, so the value there is unambiguously the previous frame's
 * output, and by the time `apply` reads it in `final` the model holds only
 * what this frame produced.
 *
 * @example
 * ```ts
 * const overlay = createEmotionOverlayPlugins({ reading: () => state.snapshot.value.current })
 * register(overlay.restore, 'pre')   // must come first
 * register(overlay.apply, 'final')
 * ```
 */
export function createEmotionOverlayPlugins(options: EmotionOverlayOptions): EmotionOverlayPlugins {
  const { reading, enabled } = options

  /** Value each touched parameter held before this overlay contributed to it. */
  const bases = new Map<string, number>()

  function declaresParameter(coreModel: MotionManagerPluginContext['model'], parameterId: string): boolean {
    // NOTICE:
    // Cubism answers an unknown parameter id with 0 and a warning rather than
    // an error, which would silently bake a wrong baseline into the model.
    // Guarded because the mock models used in tests do not implement it.
    if (typeof coreModel.getParameterIndex !== 'function')
      return true

    return coreModel.getParameterIndex(parameterId) >= 0
  }

  const restore: MotionManagerPlugin = (ctx: MotionManagerPluginContext) => {
    const coreModel = ctx.model
    if (!coreModel)
      return

    for (const [parameterId, base] of bases)
      coreModel.setParameterValueById(parameterId, base)

    // Writing the base back here is safe even for a parameter a motion will
    // key: the motion runs after this stage and overwrites it anyway.
    bases.clear()
  }

  const apply: MotionManagerPlugin = (ctx: MotionManagerPluginContext) => {
    const coreModel = ctx.model
    if (!coreModel)
      return
    if (enabled && !enabled())
      return

    for (const [parameterId, offset] of Object.entries(resolveEmotionOffsets(reading()))) {
      if (!declaresParameter(coreModel, parameterId))
        continue

      const base = coreModel.getParameterValueById(parameterId) as number
      if (!Number.isFinite(base))
        continue

      coreModel.setParameterValueById(parameterId, base + offset)
      bases.set(parameterId, base)
    }
  }

  return { restore, apply }
}
