import type { DisplayModel } from '@proj-airi/stage-ui/stores/display-models'

import { DisplayModelFormat } from '@proj-airi/stage-ui/stores/display-models'

/**
 * Checks whether a display model can be sent to the Godot stage scene input path.
 *
 * Use when:
 * - Settings needs to decide whether to materialize a selected display model for Godot
 * - Godot stage mode needs to reject formats outside the G1.1 VRM baseline
 *
 * Expects:
 * - The display model comes from the shared display model store
 *
 * Returns:
 * - `true` only for VRM display models
 */
export function isGodotSceneInputSupportedDisplayModel(model: DisplayModel): boolean {
  return model.format === DisplayModelFormat.VRM
}

/**
 * Rejects display models that the Godot stage G1.1 scene input path cannot load.
 *
 * Use when:
 * - A renderer side-effect is about to read model bytes and invoke Electron main
 *
 * Expects:
 * - The display model has already been resolved from the selected model id
 *
 * Returns:
 * - Nothing when the model is supported
 */
export function assertGodotSceneInputSupportedDisplayModel(model: DisplayModel): void {
  if (!isGodotSceneInputSupportedDisplayModel(model))
    throw new Error('Godot Stage currently supports VRM models only.')
}
