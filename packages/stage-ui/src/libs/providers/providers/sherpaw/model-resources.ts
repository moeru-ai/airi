import type { SherpawModelResource } from '@proj-airi/provider-inference'

import { sherpawModels } from '@proj-airi/provider-inference'
import { assets } from '@proj-airi/vite-plugin-sherpaw/assets'

/** Models that the host exposes as bundled files or pinned remote downloads. */
export const sherpawModelResources: SherpawModelResource[] = Object.values(sherpawModels).flatMap((model) => {
  const files = assets[model.id]
  return files ? [{ model, files }] : []
})

export const availableSherpawModels = sherpawModelResources.map(({ model }) => model)
