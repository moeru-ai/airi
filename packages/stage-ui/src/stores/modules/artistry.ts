import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed } from 'vue'

export const useArtistryStore = defineStore('artistry', () => {
  // --- Active provider & model ---
  const activeProvider = useLocalStorageManualReset<string>('artistry-provider', 'comfyui')
  const activeModel = useLocalStorageManualReset<string>('artistry-model', '')

  // --- Per-character defaults (resolved from card or global fallback) ---
  const defaultPromptPrefix = useLocalStorageManualReset<string>('artistry-prompt-prefix', '')
  const providerOptions = useLocalStorageManualReset<Record<string, any> | undefined>('artistry-provider-options', undefined)

  // --- ComfyUI provider settings ---
  const comfyuiWslBackendPath = useLocalStorageManualReset<string>(
    'artistry-comfyui-wsl-backend-path',
    '/mnt/e/CUIPP/comfyGalleryAppBackend',
  )
  const comfyuiWslNodePath = useLocalStorageManualReset<string>(
    'artistry-comfyui-wsl-node-path',
    '/home/dasilva333/.nvm/versions/node/v22.22.0/bin/node',
  )
  const comfyuiHostUrl = useLocalStorageManualReset<string>(
    'artistry-comfyui-host-url',
    'https://comfyui-plus.duckdns.org',
  )
  const comfyuiDefaultCheckpoint = useLocalStorageManualReset<string>(
    'artistry-comfyui-default-checkpoint',
    'bunnyMint_bunnyMint.safetensors',
  )
  const comfyuiDefaultRemixId = useLocalStorageManualReset<string>(
    'artistry-comfyui-default-remix-id',
    '48250602',
  )

  // --- Replicate provider settings ---
  const replicateApiKey = useLocalStorageManualReset<string>('artistry-replicate-api-key', '')
  const replicateDefaultModel = useLocalStorageManualReset<string>(
    'artistry-replicate-default-model',
    'black-forest-labs/flux-schnell',
  )
  const replicateAspectRatio = useLocalStorageManualReset<string>(
    'artistry-replicate-aspect-ratio',
    '16:9',
  )
  const replicateInferenceSteps = useLocalStorageManualReset<number>(
    'artistry-replicate-inference-steps',
    4,
  )

  function resetState() {
    activeProvider.reset()
    activeModel.reset()
    defaultPromptPrefix.reset()
    providerOptions.reset()
    comfyuiWslBackendPath.reset()
    comfyuiWslNodePath.reset()
    comfyuiHostUrl.reset()
    comfyuiDefaultCheckpoint.reset()
    comfyuiDefaultRemixId.reset()
    replicateApiKey.reset()
    replicateDefaultModel.reset()
    replicateAspectRatio.reset()
    replicateInferenceSteps.reset()
  }

  const configured = computed(() => {
    if (!activeProvider.value)
      return false

    if (activeProvider.value === 'replicate') {
      return !!replicateApiKey.value
    }

    if (activeProvider.value === 'comfyui') {
      return !!comfyuiHostUrl.value
    }

    return true
  })

  return {
    configured,
    // Active settings (resolved per card)
    activeProvider,
    activeModel,
    defaultPromptPrefix,
    providerOptions,

    // ComfyUI provider config
    comfyuiWslBackendPath,
    comfyuiWslNodePath,
    comfyuiHostUrl,
    comfyuiDefaultCheckpoint,
    comfyuiDefaultRemixId,

    // Replicate provider config
    replicateApiKey,
    replicateDefaultModel,
    replicateAspectRatio,
    replicateInferenceSteps,

    resetState,
  }
})
