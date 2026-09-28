import { defineStore, storeToRefs } from 'pinia'
import { computed, isRef, ref } from 'vue'

import { useArtistrySettingsStore } from './artistry-settings'

export type { ComfyUIWorkflowTemplate } from './artistry-settings'

export interface ResolvedArtistryConfig {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, any>
  globals: Record<string, any>
}

export const useArtistryStore = defineStore('artistry', () => {
  const settings = useArtistrySettingsStore()
  const { globalProvider, globalModel, globalPromptPrefix, globalProviderOptions, comfyuiServerUrl, comfyuiSavedWorkflows, comfyuiActiveWorkflow, replicateApiKey, replicateDefaultModel, replicateAspectRatio, replicateInferenceSteps, nanobananaApiKey, nanobananaModel, nanobananaResolution } = storeToRefs(settings)

  // --- Active settings (transient, can be overridden by cards) ---
  const activeProvider = ref(globalProvider.value)
  const activeModel = ref(globalModel.value)
  const defaultPromptPrefix = ref(globalPromptPrefix.value)
  const providerOptions = ref(globalProviderOptions.value)

  /**
   * Resets active settings to match current global user preferences.
   * This is typically called when switching to a card with no overrides.
   */
  function resetToGlobal() {
    activeProvider.value = globalProvider.value
    activeModel.value = globalModel.value
    defaultPromptPrefix.value = globalPromptPrefix.value
    providerOptions.value = globalProviderOptions.value
  }

  /**
   * Hard resets both global persistent settings and active transient state.
   */
  async function resetState() {
    // Reset persistent globals
    await settings.setGlobalProvider('none')
    await settings.setGlobalModel('')
    await settings.setGlobalPromptPrefix('')
    await settings.setGlobalProviderOptions(undefined)

    await settings.setComfyuiServerUrl('http://localhost:8188')
    await settings.setComfyuiSavedWorkflows([])
    await settings.setComfyuiActiveWorkflow('')
    await settings.setReplicateApiKey('')
    await settings.setReplicateDefaultModel('black-forest-labs/flux-schnell')
    await settings.setReplicateAspectRatio('16:9')
    await settings.setReplicateInferenceSteps(4)
    await settings.setNanobananaApiKey('')
    await settings.setNanobananaModel('gemini-3.1-flash-image-preview')
    await settings.setNanobananaResolution('1K')

    // Sync active state
    resetToGlobal()
  }

  const configured = computed(() => {
    if (!activeProvider.value)
      return false

    if (activeProvider.value === 'none')
      return false

    if (activeProvider.value === 'replicate') {
      return !!replicateApiKey.value
    }

    if (activeProvider.value === 'comfyui') {
      return !!comfyuiServerUrl.value
    }

    if (activeProvider.value === 'nanobanana') {
      return !!nanobananaApiKey.value
    }

    return true
  })

  const artistryGlobals = computed(() => ({
    comfyuiServerUrl: comfyuiServerUrl.value,
    comfyuiSavedWorkflows: comfyuiSavedWorkflows.value,
    comfyuiActiveWorkflow: comfyuiActiveWorkflow.value,
    replicateApiKey: replicateApiKey.value,
    replicateDefaultModel: replicateDefaultModel.value,
    replicateAspectRatio: replicateAspectRatio.value,
    replicateInferenceSteps: replicateInferenceSteps.value,
    nanobananaApiKey: nanobananaApiKey.value,
    nanobananaModel: nanobananaModel.value,
    nanobananaResolution: nanobananaResolution.value,
  }))

  return {
    configured,
    artistryGlobals,
    // Active settings (transient, resolved per card)
    activeProvider,
    activeModel,
    defaultPromptPrefix,
    providerOptions,

    // Global settings (persistent user preferences)
    globalProvider,
    globalModel,
    globalPromptPrefix,
    globalProviderOptions,

    // ComfyUI provider config
    comfyuiServerUrl,
    comfyuiSavedWorkflows,
    comfyuiActiveWorkflow,

    // Replicate provider config
    replicateApiKey,
    replicateDefaultModel,
    replicateAspectRatio,
    replicateInferenceSteps,

    // Nano Banana provider config
    nanobananaApiKey,
    nanobananaModel,
    nanobananaResolution,

    resetToGlobal,
    resetState,
  }
})

/**
 * Resolves Artistry configuration from a Pinia store instance.
 *
 * This utility handles the divergence between Vue components (where Pinia state is auto-unwrapped)
 * and headless service/tool contexts (where state properties remain as Refs).
 *
 * @param store - The artistry store instance (from useArtistryStore())
 */
export function resolveArtistryConfigFromStore(store: any): ResolvedArtistryConfig {
  const unwrap = (val: any) => {
    if (isRef(val))
      return val.value

    if (val && typeof val === 'object' && 'value' in val && Object.keys(val).length === 1)
      return val.value

    return val
  }

  return {
    provider: unwrap(store.activeProvider),
    model: unwrap(store.activeModel),
    promptPrefix: unwrap(store.defaultPromptPrefix),
    options: unwrap(store.providerOptions),
    globals: {
      comfyuiServerUrl: unwrap(store.comfyuiServerUrl),
      comfyuiSavedWorkflows: unwrap(store.comfyuiSavedWorkflows),
      comfyuiActiveWorkflow: unwrap(store.comfyuiActiveWorkflow),
      replicateApiKey: unwrap(store.replicateApiKey),
      replicateDefaultModel: unwrap(store.replicateDefaultModel),
      replicateAspectRatio: unwrap(store.replicateAspectRatio),
      replicateInferenceSteps: unwrap(store.replicateInferenceSteps),
      nanobananaApiKey: unwrap(store.nanobananaApiKey),
      nanobananaModel: unwrap(store.nanobananaModel),
      nanobananaResolution: unwrap(store.nanobananaResolution),
    },
  }
}
