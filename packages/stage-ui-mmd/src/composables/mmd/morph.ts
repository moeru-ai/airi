import type { SkinnedMesh } from 'three'

import type { MorphSlot } from '../../constants/morphs'

import { MORPH_CANDIDATES } from '../../constants/morphs'

/**
 * Resolves a logical {@link MorphSlot} to the first matching morph name that
 * actually exists on the model.
 *
 * Before:
 * - slot "vowelA" with candidates ["あ", "a", "A"]
 *
 * After (model that ships English morphs):
 * - "A"
 */
function resolveMorphName(slot: MorphSlot, available: Set<string>, overrides: Partial<Record<MorphSlot, string>>): string | undefined {
  const override = overrides[slot]
  if (override && available.has(override))
    return override

  for (const candidate of MORPH_CANDIDATES[slot]) {
    if (available.has(candidate))
      return candidate
  }
  return undefined
}

export interface MorphController {
  /** Logical slots that resolved to a real morph on this model. */
  readonly resolvedSlots: MorphSlot[]
  /** Every morph name exposed by the model, for settings UIs. */
  readonly availableMorphs: string[]
  /** Sets a logical slot's weight, clamped to [0, 1]. No-op if unresolved. */
  set: (slot: MorphSlot, weight: number) => void
  /** Reads back the current weight of a logical slot. */
  get: (slot: MorphSlot) => number
  /** Forces a slot to bind to an explicit morph name (settings override). */
  override: (slot: MorphSlot, morphName: string) => void
  /** Zeroes every slot this controller manages (leaves VMD morphs intact). */
  resetManaged: () => void
}

/**
 * Builds a controller over an MMD mesh's vertex morphs.
 *
 * MMD exposes morphs through `SkinnedMesh.morphTargetDictionary` (name →
 * index) and `morphTargetInfluences` (index → weight). This controller hides
 * the index bookkeeping and the per-model name resolution so the expression,
 * blink, and lip-sync composables can speak in logical slots.
 *
 * Managed weights must be written after `MMDAnimationHelper.update()` each
 * frame: a VMD clip can also key morph influences, and we want AIRI's
 * lip-sync/expression to win for the slots it owns.
 */
export function createMorphController(
  mesh: SkinnedMesh,
  overrides: Partial<Record<MorphSlot, string>> = {},
): MorphController {
  const dictionary = mesh.morphTargetDictionary ?? {}
  const available = new Set(Object.keys(dictionary))

  const slotIndex = new Map<MorphSlot, number>()
  const slotOverrides: Partial<Record<MorphSlot, string>> = { ...overrides }

  function rebind() {
    slotIndex.clear()
    for (const slot of Object.keys(MORPH_CANDIDATES) as MorphSlot[]) {
      const name = resolveMorphName(slot, available, slotOverrides)
      if (name !== undefined && dictionary[name] !== undefined)
        slotIndex.set(slot, dictionary[name])
    }
  }
  rebind()

  return {
    get resolvedSlots() {
      return Array.from(slotIndex.keys())
    },
    get availableMorphs() {
      return Array.from(available)
    },
    set(slot, weight) {
      const index = slotIndex.get(slot)
      // Read morphTargetInfluences live: caching it risks writing to a stale
      // or detached array if three (re)assigns it during updateMorphTargets.
      const influences = mesh.morphTargetInfluences
      if (index === undefined || !influences)
        return
      influences[index] = weight < 0 ? 0 : weight > 1 ? 1 : weight
    },
    get(slot) {
      const index = slotIndex.get(slot)
      const influences = mesh.morphTargetInfluences
      return index === undefined || !influences ? 0 : influences[index] ?? 0
    },
    override(slot, morphName) {
      slotOverrides[slot] = morphName
      rebind()
    },
    resetManaged() {
      const influences = mesh.morphTargetInfluences
      if (!influences)
        return
      for (const index of slotIndex.values())
        influences[index] = 0
    },
  }
}
