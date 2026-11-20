import { resolveArtistryConfigFromStore } from '@proj-airi/stage-ui/stores/modules/artistry'
import { describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'

import { installStrictToolSchemaMatchers } from '../testing/strict-tool-schema'

installStrictToolSchemaMatchers()

describe('image_journal config snapshot', () => {
  it('uses required nullable fields for strict provider schemas', async () => {
    const mockLocation = {
      origin: 'http://localhost',
      hash: '',
      search: '',
      pathname: '/',
      href: 'http://localhost/',
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
      activeProvider: ref('comfyui'),
      activeModel: ref('flux'),
      defaultPromptPrefix: ref('anime style'),
      providerOptions: ref({ seed: 42 }),
      comfyuiServerUrl: ref('https://comfyui.example.com'),
      comfyuiGenerationTimeoutMinutes: ref(20),
      comfyuiSavedWorkflows: ref([{ id: 'wf-1', name: 'Fixture workflow', workflow: {}, exposedFields: {} }]),
      comfyuiActiveWorkflow: ref('wf-1'),
      replicateApiKey: ref('r8_xxx'),
      replicateDefaultModel: ref('black-forest-labs/flux-schnell'),
      replicateAspectRatio: ref('16:9'),
      replicateInferenceSteps: ref(4),
      nanobananaApiKey: ref('AIza-test'),
      nanobananaModel: ref('gemini-3.1-flash-image-preview'),
      nanobananaResolution: ref('1K'),
    })

    expect(config).toEqual({
      provider: 'comfyui',
      model: 'flux',
      promptPrefix: 'anime style',
      options: { seed: 42 },
      globals: {
        comfyuiServerUrl: 'https://comfyui.example.com',
        comfyuiGenerationTimeoutMinutes: 20,
        comfyuiSavedWorkflows: [{ id: 'wf-1', name: 'Fixture workflow', workflow: {}, exposedFields: {} }],
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
