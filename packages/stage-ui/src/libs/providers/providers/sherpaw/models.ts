import { sherpawModels } from '@proj-airi/sherpaw-models'
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

export { formatSherpawModelName, sherpawModels } from '@proj-airi/sherpaw-models'

export type { SherpawModelId } from '@proj-airi/sherpaw-models'

/** Models that the host exposes as bundled files or pinned remote downloads. */
export const availableSherpawModels = Object.values(sherpawModels)
  .filter(model => assets[model.id] !== undefined)
