import type {} from 'pinia-plugin-synced'

import { OPENAI_IMAGE_DEFAULTS } from '@proj-airi/stage-shared'
import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, isRef, ref, watch } from 'vue'

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
  workflow: Record<string, any>
  exposedFields: Record<string, string[]>
}

export const useArtistryStore = defineStore('artistry', () => {
  // Pinia synchronization is the only cross-window state channel. These refs
  // still load and save durable values, but storage events must not echo a
  // second copy of the same state between Electron renderers.
  const persistenceOptions = { listenToStorageChanges: false }

  // --- Persistent Global Settings (User Preferences) ---
  const globalProvider = useLocalStorageManualReset<string>('artistry-provider', 'none', persistenceOptions)
  const globalModel = useLocalStorageManualReset<string>('artistry-model', '', persistenceOptions)
  const globalPromptPrefix = useLocalStorageManualReset<string>('artistry-prompt-prefix', '', persistenceOptions)
  const globalProviderOptions = useLocalStorageManualReset<Record<string, unknown> | undefined>('artistry-provider-options', undefined, persistenceOptions)

  // --- Active settings (transient, can be overridden by cards) ---
  const activeProvider = ref(globalProvider.value)
  const activeModel = ref(globalModel.value)
  const defaultPromptPrefix = ref(globalPromptPrefix.value)
  const providerOptions = ref(globalProviderOptions.value)

  // --- ComfyUI provider settings ---
  const comfyuiServerUrl = useLocalStorageManualReset<string>(
    'artistry-comfyui-server-url',
    'http://localhost:8188',
    persistenceOptions,
  )
  const comfyuiSavedWorkflows = useLocalStorageManualReset<ComfyUIWorkflowTemplate[]>(
    'artistry-comfyui-saved-workflows',
    [],
    persistenceOptions,
  )
  const comfyuiActiveWorkflow = useLocalStorageManualReset<string>(
    'artistry-comfyui-active-workflow',
    '',
    persistenceOptions,
  )

  // --- Replicate provider settings ---
  const replicateApiKey = useLocalStorageManualReset<string>('artistry-replicate-api-key', '', persistenceOptions)
  const replicateDefaultModel = useLocalStorageManualReset<string>(
    'artistry-replicate-default-model',
    'black-forest-labs/flux-schnell',
    persistenceOptions,
  )
  const replicateAspectRatio = useLocalStorageManualReset<string>(
    'artistry-replicate-aspect-ratio',
    '16:9',
    persistenceOptions,
  )
  const replicateInferenceSteps = useLocalStorageManualReset<number>(
    'artistry-replicate-inference-steps',
    4,
    persistenceOptions,
  )

  // --- Nano Banana (Google AI Studio) provider settings ---
  const nanobananaApiKey = useLocalStorageManualReset<string>('artistry-nanobanana-api-key', '', persistenceOptions)
  const nanobananaModel = useLocalStorageManualReset<string>(
    'artistry-nanobanana-model',
    'gemini-3.1-flash-image-preview',
    persistenceOptions,
  )
  const nanobananaResolution = useLocalStorageManualReset<string>(
    'artistry-nanobanana-resolution',
    '1K',
    persistenceOptions,
  )

  const openaiImageApiKey = useLocalStorageManualReset('artistry-openai-image-api-key', '', persistenceOptions)
  const openaiImageBaseUrl = useLocalStorageManualReset<string>('artistry-openai-image-base-url', OPENAI_IMAGE_DEFAULTS.baseUrl, persistenceOptions)
  const openaiImageModel = useLocalStorageManualReset<string>('artistry-openai-image-model', OPENAI_IMAGE_DEFAULTS.model, persistenceOptions)
  const openaiImageWidth = useLocalStorageManualReset('artistry-openai-image-width', '', persistenceOptions)
  const openaiImageHeight = useLocalStorageManualReset('artistry-openai-image-height', '', persistenceOptions)

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
    openaiImageApiKey.reset()
    openaiImageBaseUrl.reset()
    openaiImageModel.reset()
    openaiImageWidth.reset()
    openaiImageHeight.reset()

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

    if (activeProvider.value === 'openai-image') {
      return !!openaiImageApiKey.value.trim() && !!openaiImageBaseUrl.value.trim() && !!openaiImageModel.value.trim()
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
    openaiImageApiKey: openaiImageApiKey.value,
    openaiImageBaseUrl: openaiImageBaseUrl.value,
    openaiImageModel: openaiImageModel.value,
    openaiImageWidth: openaiImageWidth.value,
    openaiImageHeight: openaiImageHeight.value,
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
    openaiImageApiKey,
    openaiImageBaseUrl,
    openaiImageModel,
    openaiImageWidth,
    openaiImageHeight,

    resetToGlobal,
    resetState,
  }
}, {
  synced: {
    state: true,
  },
})

/**
 * Resolves Artistry configuration from a Pinia store instance.
 *
 * This utility handles the divergence between Vue components (where Pinia state is auto-unwrapped)
 * and headless service/tool contexts (where state properties remain as Refs).
 *
 * @example
 * resolveArtistryConfigFromStore(useArtistryStore()).provider
 * // => 'none'
 */
export function resolveArtistryConfigFromStore(store: {
  activeProvider: string | { value: string }
  activeModel: string | { value: string }
  defaultPromptPrefix: string | { value: string }
  providerOptions: Record<string, unknown> | { value: Record<string, unknown> | undefined } | undefined
} & Partial<Record<
  | 'comfyuiServerUrl' | 'comfyuiSavedWorkflows' | 'comfyuiActiveWorkflow'
  | 'replicateApiKey' | 'replicateDefaultModel' | 'replicateAspectRatio' | 'replicateInferenceSteps'
  | 'nanobananaApiKey' | 'nanobananaModel' | 'nanobananaResolution'
  | 'openaiImageApiKey' | 'openaiImageBaseUrl' | 'openaiImageModel' | 'openaiImageWidth' | 'openaiImageHeight',
  unknown
>>): ResolvedArtistryConfig {
  const unwrap = <T>(val: T | { value: T }): T => {
    if (isRef<T>(val))
      return val.value

    if (val && typeof val === 'object' && 'value' in val && Object.keys(val).length === 1)
      return val.value as T

    return val as T
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
      openaiImageApiKey: unwrap(store.openaiImageApiKey),
      openaiImageBaseUrl: unwrap(store.openaiImageBaseUrl),
      openaiImageModel: unwrap(store.openaiImageModel),
      openaiImageWidth: unwrap(store.openaiImageWidth),
      openaiImageHeight: unwrap(store.openaiImageHeight),
    },
  }
}
