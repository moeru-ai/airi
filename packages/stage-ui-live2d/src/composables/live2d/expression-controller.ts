import type { Ref } from 'vue'

import type { ExpressionBlendMode, ExpressionEntry, ExpressionGroupDefinition } from '../../stores/expression-store'
import type { PixiLive2DInternalModel } from './motion-manager'

import { useExpressionStore } from '../../stores/expression-store'

// ---------------------------------------------------------------------------
// Types for model3.json / exp3.json data
// ---------------------------------------------------------------------------

/** A single expression reference inside model3.json FileReferences.Expressions[]. */
interface Model3ExpressionRef {
  Name: string
  File: string
}

/** Parameter entry inside an exp3.json file. */
interface Exp3Parameter {
  Id: string
  Value: number
  Blend: 'Add' | 'Multiply' | 'Overwrite'
}

/** Root structure of an exp3.json file. */
interface Exp3Json {
  Type: string
  Parameters: Exp3Parameter[]
  // FadeInTime / FadeOutTime are intentionally ignored (we do direct application).
}

// ---------------------------------------------------------------------------
// Controller
// ---------------------------------------------------------------------------

export interface ExpressionControllerOptions {
  /**
   * The loaded Live2D internal model reference (reactive so it can be null
   * while a model is being swapped).
   */
  internalModel: Ref<PixiLive2DInternalModel | undefined>

  /**
   * An optional model identifier used for persistence scoping.
   * Falls back to `'unknown'` if not provided.
   */
  modelId?: string
}

/**
 * Create an expression controller that:
 * 1. Parses exp3 data from the model settings
 * 2. Registers entries into the Pinia expression store
 * 3. Provides an `applyExpressions()` function to be called every frame
 */
export function useExpressionController(options: ExpressionControllerOptions) {
  const store = useExpressionStore()

  // Track which parameter IDs were written in the previous frame so we can
  // detect active→inactive transitions and explicitly reset them.
  const activeLastFrame = new Set<string>()

  // ---- Initialisation (called once after model load) ----------------------

  /**
   * Parse model3.json expression references and the corresponding exp3 data,
   * then register everything in the store.
   *
   * @param expressionRefs - `FileReferences.Expressions` from model3.json
   * @param readExpFile    - An async function that reads the content of an
   *                         exp3.json file given its path (relative to the
   *                         model root inside the ZIP / OPFS).
   */
  async function initialise(
    expressionRefs: Model3ExpressionRef[],
    readExpFile: (path: string) => Promise<string>,
  ) {
    const groups: ExpressionGroupDefinition[] = []
    const entryMap = new Map<string, ExpressionEntry>()

    for (const expRef of expressionRefs) {
      try {
        const raw = await readExpFile(expRef.File)
        const exp3: Exp3Json = JSON.parse(raw)

        const groupParams: ExpressionGroupDefinition['parameters'] = []

        for (const param of exp3.Parameters) {
          const blend = normaliseBlend(param.Blend)

          groupParams.push({
            parameterId: param.Id,
            blend,
            value: param.Value,
          })

          // Only create the entry once per parameterId (first-come basis for
          // modelDefault; the store handles last-write-wins at runtime).
          if (!entryMap.has(param.Id)) {
            const modelDefault = getModelParameterDefault(param.Id)
            entryMap.set(param.Id, {
              name: param.Id,
              parameterId: param.Id,
              blend,
              currentValue: modelDefault,
              defaultValue: modelDefault,
              modelDefault,
              targetValue: param.Value,
            })
          }
          else if (param.Value !== 0) {
            // Update targetValue if this group has a non-zero value
            // (prefer non-zero over zero as the "intended activation value")
            const existing = entryMap.get(param.Id)!
            if (existing.targetValue === 0) {
              existing.targetValue = param.Value
            }
          }
        }

        groups.push({ name: expRef.Name, parameters: groupParams })
      }
      catch (err) {
        console.warn(`[expression-controller] Failed to parse exp3 for "${expRef.Name}" (${expRef.File}):`, err)
      }
    }

    store.registerExpressions(
      options.modelId ?? 'unknown',
      groups,
      Array.from(entryMap.values()),
    )
  }

  // ---- Per-frame application -----------------------------------------------

  /**
   * Apply all expression entries from the store onto the Live2D model.
   *
   * Two key mechanisms:
   *
   * 1. **Noop detection**: entries whose currentValue is the blend-mode
   *    identity (Add:0, Multiply:1, Overwrite:modelDefault) are skipped.
   *
   * 2. **Transition reset**: when an entry was active last frame but is
   *    noop this frame, we explicitly write modelDefault to clear the
   *    stale value (expression-only params are not reset by motion).
   *
   * Multiply blend reads the current frame parameter value (post-blink)
   * so auto-blink modulation is naturally preserved.
   *
   * @param coreModel - The Cubism core model (coreModel from internalModel).
   */
  function applyExpressions(coreModel: PixiLive2DInternalModel['coreModel']) {
    const activeThisFrame = new Set<string>()

    for (const entry of store.expressions.values()) {
      if (isNoopValue(entry))
        continue

      const blendedValue = computeTargetValue(entry, coreModel)

      coreModel.setParameterValueById(entry.parameterId, blendedValue)
      activeThisFrame.add(entry.parameterId)
    }

    // Reset parameters that were active last frame but not this frame.
    // This handles the active→inactive transition (e.g. toggle OFF).
    for (const paramId of activeLastFrame) {
      if (!activeThisFrame.has(paramId)) {
        const entry = findEntryByParameterId(paramId)
        if (entry)
          coreModel.setParameterValueById(paramId, entry.modelDefault)
      }
    }

    activeLastFrame.clear()
    for (const id of activeThisFrame)
      activeLastFrame.add(id)
  }

  /**
   * Does this entry's currentValue produce no visual effect when blended?
   * - Add: adding 0 changes nothing.
   * - Multiply: multiplying by 1 changes nothing.
   * - Overwrite: writing modelDefault changes nothing.
   */
  function isNoopValue(entry: ExpressionEntry): boolean {
    switch (entry.blend) {
      case 'Add':
        return entry.currentValue === 0
      case 'Multiply':
        return entry.currentValue === 1
      default:
        return entry.currentValue === entry.modelDefault
    }
  }

  /**
   * Compute the final blended value for a parameter.
   *
   * - **Add**: modelDefault + currentValue (stable base prevents accumulation
   *   on expression-only parameters not reset by motion each frame).
   * - **Multiply**: reads the CURRENT frame parameter value (post-blink/motion)
   *   and scales it.  This preserves auto-blink modulation because blink/motion
   *   always write a fresh value before the expression plugin runs.
   * - **Overwrite**: direct replacement.
   */
  function computeTargetValue(entry: ExpressionEntry, coreModel: PixiLive2DInternalModel['coreModel']): number {
    switch (entry.blend) {
      case 'Add':
        return entry.modelDefault + entry.currentValue
      case 'Multiply': {
        const currentFrameValue = coreModel.getParameterValueById(entry.parameterId) as number
        return currentFrameValue * entry.currentValue
      }
      default:
        return entry.currentValue
    }
  }

  /** Look up an entry by its Live2D parameter ID. */
  function findEntryByParameterId(paramId: string): ExpressionEntry | undefined {
    for (const entry of store.expressions.values()) {
      if (entry.parameterId === paramId)
        return entry
    }
    return undefined
  }

  // ---- Cleanup -------------------------------------------------------------

  function dispose() {
    store.dispose()
  }

  // ---- Private helpers -----------------------------------------------------

  function normaliseBlend(raw: string): ExpressionBlendMode {
    switch (raw) {
      case 'Add':
        return 'Add'
      case 'Multiply':
        return 'Multiply'
      default:
        return 'Overwrite'
    }
  }

  /**
   * Read the model default for a parameter from the currently loaded model.
   * Falls back to 0 if the model is not available yet (the store will sync
   * later via `restoreDefaults`).
   */
  function getModelParameterDefault(parameterId: string): number {
    const im = options.internalModel.value
    if (!im)
      return 0

    try {
      // Prefer the dedicated default-value API when available (Cubism 4+).
      const defaultApi = (im.coreModel as any).getParameterDefaultValueById
      if (typeof defaultApi === 'function') {
        const val = defaultApi.call(im.coreModel, parameterId)
        if (val != null)
          return val as number
      }
      // Fall back to the current value which, right after model load, IS
      // the default.
      return (im.coreModel.getParameterValueById(parameterId) as number) ?? 0
    }
    catch {
      return 0
    }
  }

  return {
    initialise,
    applyExpressions,
    dispose,
  }
}
