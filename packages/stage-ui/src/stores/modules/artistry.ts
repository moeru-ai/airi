import type { ArtistryGlobals, ComfyUIWorkflowTemplate } from '@proj-airi/stage-shared'
import type {} from 'pinia-plugin-synced'
import type { MaybeRef } from 'vue'

import { useLocalStorageManualReset } from '@proj-airi/stage-shared/composables'
import { defineStore } from 'pinia'
import { computed, ref, toValue, watch } from 'vue'

export interface ResolvedArtistryConfig {
  provider?: string
  model?: string
  promptPrefix?: string
  options?: Record<string, unknown>
  globals: ArtistryGlobals
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
  const comfyuiGenerationTimeoutMinutes = useLocalStorageManualReset<number>(
    'artistry-comfyui-generation-timeout-minutes',
    10,
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
    comfyuiGenerationTimeoutMinutes.reset()
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
    comfyuiGenerationTimeoutMinutes: comfyuiGenerationTimeoutMinutes.value,
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
    comfyuiGenerationTimeoutMinutes,
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
}, {
  synced: {
    state: true,
  },
})

type ArtistryConfigSource = {
  [Key in keyof ArtistryGlobals]: MaybeRef<ArtistryGlobals[Key]>
} & {
  activeProvider: MaybeRef<string>
  activeModel: MaybeRef<string>
  defaultPromptPrefix: MaybeRef<string>
  providerOptions: MaybeRef<ResolvedArtistryConfig['options']>
}

/**
 * Reads the current configuration from actual Vue refs or an unwrapped Pinia store.
 * The IPC caller serializes this result before main applies the shared schema.
 *
 * @example
 * const config = resolveArtistryConfigFromStore(useArtistryStore())
 */
export function resolveArtistryConfigFromStore(store: ArtistryConfigSource): ResolvedArtistryConfig {
  return {
    provider: toValue(store.activeProvider),
    model: toValue(store.activeModel),
    promptPrefix: toValue(store.defaultPromptPrefix),
    options: toValue(store.providerOptions),
    globals: {
      comfyuiServerUrl: toValue(store.comfyuiServerUrl),
      comfyuiGenerationTimeoutMinutes: toValue(store.comfyuiGenerationTimeoutMinutes),
      comfyuiSavedWorkflows: toValue(store.comfyuiSavedWorkflows),
      comfyuiActiveWorkflow: toValue(store.comfyuiActiveWorkflow),
      replicateApiKey: toValue(store.replicateApiKey),
      replicateDefaultModel: toValue(store.replicateDefaultModel),
      replicateAspectRatio: toValue(store.replicateAspectRatio),
      replicateInferenceSteps: toValue(store.replicateInferenceSteps),
      nanobananaApiKey: toValue(store.nanobananaApiKey),
      nanobananaModel: toValue(store.nanobananaModel),
      nanobananaResolution: toValue(store.nanobananaResolution),
    },
  }
}
