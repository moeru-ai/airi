import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, isRef, ref, watch } from 'vue'

export interface ResolvedArtistryConfig {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, any>
  globals: Record<string, any>
}

export interface ComfyUIWorkflowTemplate {
  id: string
  name: string
  workflow: Record<string, any>
  exposedFields: Record<string, string[]>
}

export const useArtistryStore = defineStore('artistry', () => {
  // --- Persistent Global Settings (User Preferences) ---
  const globalProvider = useLocalStorageManualReset<string>('artistry-provider', 'comfyui')
  const globalModel = useLocalStorageManualReset<string>('artistry-model', '')
  const globalPromptPrefix = useLocalStorageManualReset<string>('artistry-prompt-prefix', '')
  const globalProviderOptions = useLocalStorageManualReset<Record<string, any> | undefined>('artistry-provider-options', undefined)

  // --- Active settings (transient, can be overridden by cards) ---
  const activeProvider = ref(globalProvider.value)
  const activeModel = ref(globalModel.value)
  const defaultPromptPrefix = ref(globalPromptPrefix.value)
  const providerOptions = ref(globalProviderOptions.value)

  // --- ComfyUI provider settings ---
  const comfyuiServerUrl = useLocalStorageManualReset<string>(
    'artistry-comfyui-server-url',
    'http://localhost:8188',
  )
  const comfyuiSavedWorkflows = useLocalStorageManualReset<ComfyUIWorkflowTemplate[]>(
    'artistry-comfyui-saved-workflows',
    [],
  )
  const comfyuiActiveWorkflow = useLocalStorageManualReset<string>(
    'artistry-comfyui-active-workflow',
    '',
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

  // --- Nano Banana (Google AI Studio) provider settings ---
  const nanobananaApiKey = useLocalStorageManualReset<string>('artistry-nanobanana-api-key', '')
  const nanobananaModel = useLocalStorageManualReset<string>(
    'artistry-nanobanana-model',
    'gemini-3.1-flash-image-preview',
  )
  const nanobananaResolution = useLocalStorageManualReset<string>(
    'artistry-nanobanana-resolution',
    '1K',
  )

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
  function resetState() {
    // Reset persistent globals
    globalProvider.reset()
    globalModel.reset()
    globalPromptPrefix.reset()
    globalProviderOptions.reset()

    comfyuiServerUrl.reset()
    comfyuiSavedWorkflows.reset()
    comfyuiActiveWorkflow.reset()
    replicateApiKey.reset()
    replicateDefaultModel.reset()
    replicateAspectRatio.reset()
    replicateInferenceSteps.reset()
    nanobananaApiKey.reset()
    nanobananaModel.reset()
    nanobananaResolution.reset()

    // Sync active state
    resetToGlobal()
  }

  // Sync active state when global state changes (e.g. from Settings page)
  // NOTICE: We only sync if the active state currently matches the global state (i.e. no card override is active),
  // OR we just sync anyway and let airi-card's watch override it again if a card is active.
  // The latter is simpler and more predictable.
  watch(globalProvider, val => activeProvider.value = val)
  watch(globalModel, val => activeModel.value = val)
  watch(globalPromptPrefix, val => defaultPromptPrefix.value = val)
  watch(globalProviderOptions, val => providerOptions.value = val)

  const configured = computed(() => {
    if (!activeProvider.value)
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
  const unwrap = (val: any) => (isRef(val) ? val.value : val)

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
