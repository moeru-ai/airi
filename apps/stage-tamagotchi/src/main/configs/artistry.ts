import { any, array, number, object, optional, string } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const artistryConfigSchema = object({
  artistryGlobals: optional(object({
    comfyuiActiveWorkflow: optional(string(), ''),
    comfyuiSavedWorkflows: optional(array(any()), []),
    comfyuiServerUrl: optional(string(), 'http://localhost:8188'),
    nanobananaApiKey: optional(string(), ''),
    nanobananaModel: optional(string(), 'gemini-3.1-flash-image-preview'),
    nanobananaResolution: optional(string(), '1K'),
    replicateApiKey: optional(string(), ''),
    replicateAspectRatio: optional(string(), '16:9'),
    replicateDefaultModel: optional(string(), 'black-forest-labs/flux-schnell'),
    replicateInferenceSteps: optional(number(), 4),
  }), {}),
  artistryProvider: optional(string(), 'none'),
})

export function createArtistryConfig() {
  const config = createConfig('artistry', 'options.json', artistryConfigSchema)
  config.setup()

  return config
}
