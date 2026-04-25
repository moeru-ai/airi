import { resolveArtistryConfigFromStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { describe, expect, it } from 'vitest'

describe('image_journal config snapshot', () => {
  it('extracts plain values instead of leaking Ref objects', () => {
    const config = resolveArtistryConfigFromStore({
      activeProvider: { value: 'comfyui' },
      activeModel: { value: 'flux' },
      defaultPromptPrefix: { value: 'anime style' },
      providerOptions: { value: { seed: 42 } },
      comfyuiServerUrl: { value: 'http://localhost:8188' },
      comfyuiSavedWorkflows: { value: [{ id: 'wf-1' }] },
      comfyuiActiveWorkflow: { value: 'wf-1' },
      replicateApiKey: { value: 'r8_xxx' },
      replicateDefaultModel: { value: 'black-forest-labs/flux-schnell' },
      replicateAspectRatio: { value: '16:9' },
      replicateInferenceSteps: { value: 4 },
      nanobananaApiKey: { value: 'AIza-test' },
      nanobananaModel: { value: 'gemini-3.1-flash-image-preview' },
      nanobananaResolution: { value: '1K' },
    })

    expect(config).toEqual({
      provider: 'comfyui',
      model: 'flux',
      promptPrefix: 'anime style',
      options: { seed: 42 },
      globals: {
        comfyuiServerUrl: 'http://localhost:8188',
        comfyuiSavedWorkflows: [{ id: 'wf-1' }],
        comfyuiActiveWorkflow: 'wf-1',
        replicateApiKey: 'r8_xxx',
        replicateDefaultModel: 'black-forest-labs/flux-schnell',
        replicateAspectRatio: '16:9',
        replicateInferenceSteps: 4,
        nanobananaApiKey: 'AIza-test',
        nanobananaModel: 'gemini-3.1-flash-image-preview',
        nanobananaResolution: '1K',
      },
    })
  })
})
