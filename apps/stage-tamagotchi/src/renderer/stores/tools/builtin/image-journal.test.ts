import { resolveArtistryConfigFromStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { describe, expect, it, vi } from 'vitest'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'

installStrictToolSchemaMatchers()

describe('image_journal config snapshot', () => {
  it('uses required nullable fields for strict provider schemas', async () => {
    const mockLocation = {
      hash: '',
      href: 'http://localhost/',
      origin: 'http://localhost',
      pathname: '/',
      search: '',
    }
    vi.stubGlobal('window', {
      location: mockLocation,
    })
    vi.stubGlobal('location', mockLocation)

    const { imageJournalTools } = await import('./image-journal')
    const tools = await imageJournalTools()

    expect(tools).toSatisfyStrictToolSchemas()
  }, 15_000)

  it('extracts plain values instead of leaking Ref objects', () => {
    const config = resolveArtistryConfigFromStore({
      activeModel: { value: 'flux' },
      activeProvider: { value: 'comfyui' },
      comfyuiActiveWorkflow: { value: 'wf-1' },
      comfyuiSavedWorkflows: { value: [{ id: 'wf-1' }] },
      comfyuiServerUrl: { value: 'http://localhost:8188' },
      defaultPromptPrefix: { value: 'anime style' },
      nanobananaApiKey: { value: 'AIza-test' },
      nanobananaModel: { value: 'gemini-3.1-flash-image-preview' },
      nanobananaResolution: { value: '1K' },
      providerOptions: { value: { seed: 42 } },
      replicateApiKey: { value: 'r8_xxx' },
      replicateAspectRatio: { value: '16:9' },
      replicateDefaultModel: { value: 'black-forest-labs/flux-schnell' },
      replicateInferenceSteps: { value: 4 },
    })

    expect(config).toEqual({
      globals: {
        comfyuiActiveWorkflow: 'wf-1',
        comfyuiSavedWorkflows: [{ id: 'wf-1' }],
        comfyuiServerUrl: 'http://localhost:8188',
        nanobananaApiKey: 'AIza-test',
        nanobananaModel: 'gemini-3.1-flash-image-preview',
        nanobananaResolution: '1K',
        replicateApiKey: 'r8_xxx',
        replicateAspectRatio: '16:9',
        replicateDefaultModel: 'black-forest-labs/flux-schnell',
        replicateInferenceSteps: 4,
      },
      model: 'flux',
      options: { seed: 42 },
      promptPrefix: 'anime style',
      provider: 'comfyui',
    })
  })
})
