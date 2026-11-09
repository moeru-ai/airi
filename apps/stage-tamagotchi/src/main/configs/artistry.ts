import { OPENAI_IMAGE_DEFAULTS } from '@proj-airi/stage-shared'
import { array, number, object, optional, string, unknown } from 'valibot'

import { createConfig } from '../libs/electron/persistence'

export const artistryConfigSchema = object({
  artistryProvider: optional(string(), 'none'),
  artistryGlobals: optional(object({
    comfyuiServerUrl: optional(string(), 'http://localhost:8188'),
    comfyuiSavedWorkflows: optional(array(unknown()), []),
    comfyuiActiveWorkflow: optional(string(), ''),
    replicateApiKey: optional(string(), ''),
    replicateDefaultModel: optional(string(), 'black-forest-labs/flux-schnell'),
    replicateAspectRatio: optional(string(), '16:9'),
    replicateInferenceSteps: optional(number(), 4),
    nanobananaApiKey: optional(string(), ''),
    nanobananaModel: optional(string(), 'gemini-3.1-flash-image-preview'),
    nanobananaResolution: optional(string(), '1K'),
    openaiImageApiKey: optional(string(), ''),
    openaiImageBaseUrl: optional(string(), OPENAI_IMAGE_DEFAULTS.baseUrl),
    openaiImageModel: optional(string(), OPENAI_IMAGE_DEFAULTS.model),
    openaiImageWidth: optional(string(), ''),
    openaiImageHeight: optional(string(), ''),
  }), {}),
})

export function createArtistryConfig() {
  const config = createConfig('artistry', 'options.json', artistryConfigSchema)
  config.setup()

  return config
}
