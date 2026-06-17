import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, isRef, ref, watch, type Ref } from 'vue'

export interface ResolvedArtistryConfig {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, unknown>
  globals: Record<string, unknown>
}

export interface ComfyUIWorkflowTemplate {
  id: string
  name: string
  workflow: Record<string, unknown>
  exposedFields: Record<string, string[]>
}

export const useArtistryStore = defineStore('artistry', () => {
  // --- Persistent Global Settings (User Preferences) ---
  const globalProvider = useLocalStorageManualReset<string>('artistry-provider', 'none')
  const globalModel = useLocalStorageManualReset<string>('artistry-model', '')
  const globalPromptPrefix = useLocalStorageManualReset<string>('artistry-prompt-prefix', '')
  const globalProviderOptions = useLocalStorageManualReset<Record<string, unknown> | undefined>(
    'artistry-provider-options',
    undefined,
  )

  // --- Active settings (transient, can be overridden by cards) ---
  const activeProvider = ref(globalProvider.value)
  const activeModel = ref(globalModel.value)
  const defaultPromptPrefix = ref(globalPromptPrefix.value)
  const providerOptions = ref(globalProviderOptions.value)

  // --- ComfyUI provider settings ---
  const comfyuiServerUrl = useLocalStorageManualReset<string>('artistry-comfyui-server-url', 'http://localhost:8188')
  const comfyuiSavedWorkflows = useLocalStorageManualReset<ComfyUIWorkflowTemplate[]>(
    'artistry-comfyui-saved-workflows',
    [],
  )
  const comfyuiActiveWorkflow = useLocalStorageManualReset<string>('artistry-comfyui-active-workflow', '')

  // --- Replicate provider settings ---
  const replicateApiKey = useLocalStorageManualReset<string>('artistry-replicate-api-key', '')
  const replicateDefaultModel = useLocalStorageManualReset<string>(
    'artistry-replicate-default-model',
    'black-forest-labs/flux-schnell',
  )
  const replicateAspectRatio = useLocalStorageManualReset<string>('artistry-replicate-aspect-ratio', '16:9')
  const replicateInferenceSteps = useLocalStorageManualReset<number>('artistry-replicate-inference-steps', 4)

  // --- Nano Banana (Google AI Studio) provider settings ---
  const nanobananaApiKey = useLocalStorageManualReset<string>('artistry-nanobanana-api-key', '')
  const nanobananaModel = useLocalStorageManualReset<string>(
    'artistry-nanobanana-model',
    'gemini-3.1-flash-image-preview',
  )
  const nanobananaResolution = useLocalStorageManualReset<string>('artistry-nanobanana-resolution', '1K')

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
  watch(globalProvider, (val) => (activeProvider.value = val))
  watch(globalModel, (val) => (activeModel.value = val))
  watch(globalPromptPrefix, (val) => (defaultPromptPrefix.value = val))
  watch(globalProviderOptions, (val) => (providerOptions.value = val))

  const configured = computed(() => {
    if (!activeProvider.value) return false

    if (activeProvider.value === 'none') return false

    if (activeProvider.value === 'replicate') {
      return Boolean(replicateApiKey.value)
    }

    if (activeProvider.value === 'comfyui') {
      return Boolean(comfyuiServerUrl.value)
    }

    if (activeProvider.value === 'nanobanana') {
      return Boolean(nanobananaApiKey.value)
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
export function resolveArtistryConfigFromStore(store: ReturnType<typeof useArtistryStore>): ResolvedArtistryConfig {
  /**
   * Unwraps a Pinia store property that may be a Ref or a plain value.
   * In Vue component context, Pinia auto-unwraps Refs (so `val` is T).
   * In headless service/tool context, `val` remains a Ref-like object with a `value` property.
   */
  const unwrap = <T>(val: T | Ref<T>): T => {
    if (isRef(val)) return val.value
    return val
  }

  return {
    provider: unwrap<string | undefined>(store.activeProvider),
    model: unwrap<string | undefined>(store.activeModel),
    promptPrefix: unwrap<string | undefined>(store.defaultPromptPrefix),
    options: unwrap<Record<string, unknown> | undefined>(store.providerOptions),
    globals: {
      comfyuiServerUrl: unwrap<string>(store.comfyuiServerUrl),
      comfyuiSavedWorkflows: unwrap<ComfyUIWorkflowTemplate[]>(store.comfyuiSavedWorkflows),
      comfyuiActiveWorkflow: unwrap<string>(store.comfyuiActiveWorkflow),
      replicateApiKey: unwrap<string>(store.replicateApiKey),
      replicateDefaultModel: unwrap<string>(store.replicateDefaultModel),
      replicateAspectRatio: unwrap<string>(store.replicateAspectRatio),
      replicateInferenceSteps: unwrap<number>(store.replicateInferenceSteps),
      nanobananaApiKey: unwrap<string>(store.nanobananaApiKey),
      nanobananaModel: unwrap<string>(store.nanobananaModel),
      nanobananaResolution: unwrap<string>(store.nanobananaResolution),
    },
  }
}
