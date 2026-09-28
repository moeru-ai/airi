import { defineStore } from 'pinia'
import { shallowRef } from 'vue'

/** A saved workflow and the inputs exposed to image generation. */
export interface ComfyUIWorkflowTemplate {
  id: string
  name: string
  workflow: Record<string, {
    class_type: string
    _meta?: { title?: string }
    inputs: Record<string, unknown>
  }>
  exposedFields: Record<string, string[]>
}

function loadSetting<Value>(key: string, initial: Value) {
  const stored = typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
  return shallowRef<Value>(stored === null ? initial : typeof initial === 'string' ? stored : JSON.parse(stored))
}

function persistSetting(key: string, value: unknown) {
  if (typeof localStorage === 'undefined')
    return
  if (value === undefined)
    localStorage.removeItem(key)
  else
    localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value))
}

/** Global configuration is replicated; only leader actions persist it. */
export const useArtistrySettingsStore = defineStore('artistry-settings', () => {
  const globalProvider = loadSetting<string>('artistry-provider', 'none')
  const globalModel = loadSetting<string>('artistry-model', '')
  const globalPromptPrefix = loadSetting<string>('artistry-prompt-prefix', '')
  const globalProviderOptions = loadSetting<Record<string, unknown> | undefined>('artistry-provider-options', undefined)

  const comfyuiServerUrl = loadSetting<string>(
    'artistry-comfyui-server-url',
    'http://localhost:8188',
  )
  const comfyuiSavedWorkflows = loadSetting<ComfyUIWorkflowTemplate[]>(
    'artistry-comfyui-saved-workflows',
    [],
  )
  const comfyuiActiveWorkflow = loadSetting<string>(
    'artistry-comfyui-active-workflow',
    '',
  )

  const replicateApiKey = loadSetting<string>('artistry-replicate-api-key', '')
  const replicateDefaultModel = loadSetting<string>(
    'artistry-replicate-default-model',
    'black-forest-labs/flux-schnell',
  )
  const replicateAspectRatio = loadSetting<string>(
    'artistry-replicate-aspect-ratio',
    '16:9',
  )
  const replicateInferenceSteps = loadSetting<number>(
    'artistry-replicate-inference-steps',
    4,
  )

  const nanobananaApiKey = loadSetting<string>('artistry-nanobanana-api-key', '')
  const nanobananaModel = loadSetting<string>(
    'artistry-nanobanana-model',
    'gemini-3.1-flash-image-preview',
  )
  const nanobananaResolution = loadSetting<string>(
    'artistry-nanobanana-resolution',
    '1K',
  )

  async function setGlobalProvider(value: typeof globalProvider.value) {
    globalProvider.value = value
    persistSetting('artistry-provider', value)
  }

  async function setGlobalModel(value: typeof globalModel.value) {
    globalModel.value = value
    persistSetting('artistry-model', value)
  }

  async function setGlobalPromptPrefix(value: typeof globalPromptPrefix.value) {
    globalPromptPrefix.value = value
    persistSetting('artistry-prompt-prefix', value)
  }

  async function setGlobalProviderOptions(value: typeof globalProviderOptions.value) {
    globalProviderOptions.value = value
    persistSetting('artistry-provider-options', value)
  }

  async function setComfyuiServerUrl(value: typeof comfyuiServerUrl.value) {
    comfyuiServerUrl.value = value
    persistSetting('artistry-comfyui-server-url', value)
  }

  async function setComfyuiSavedWorkflows(value: typeof comfyuiSavedWorkflows.value) {
    comfyuiSavedWorkflows.value = value
    persistSetting('artistry-comfyui-saved-workflows', value)
  }

  async function setComfyuiActiveWorkflow(value: typeof comfyuiActiveWorkflow.value) {
    comfyuiActiveWorkflow.value = value
    persistSetting('artistry-comfyui-active-workflow', value)
  }

  async function setReplicateApiKey(value: typeof replicateApiKey.value) {
    replicateApiKey.value = value
    persistSetting('artistry-replicate-api-key', value)
  }

  async function setReplicateDefaultModel(value: typeof replicateDefaultModel.value) {
    replicateDefaultModel.value = value
    persistSetting('artistry-replicate-default-model', value)
  }

  async function setReplicateAspectRatio(value: typeof replicateAspectRatio.value) {
    replicateAspectRatio.value = value
    persistSetting('artistry-replicate-aspect-ratio', value)
  }

  async function setReplicateInferenceSteps(value: typeof replicateInferenceSteps.value) {
    replicateInferenceSteps.value = value
    persistSetting('artistry-replicate-inference-steps', value)
  }

  async function setNanobananaApiKey(value: typeof nanobananaApiKey.value) {
    nanobananaApiKey.value = value
    persistSetting('artistry-nanobanana-api-key', value)
  }

  async function setNanobananaModel(value: typeof nanobananaModel.value) {
    nanobananaModel.value = value
    persistSetting('artistry-nanobanana-model', value)
  }

  async function setNanobananaResolution(value: typeof nanobananaResolution.value) {
    nanobananaResolution.value = value
    persistSetting('artistry-nanobanana-resolution', value)
  }

  return { globalProvider, globalModel, globalPromptPrefix, globalProviderOptions, comfyuiServerUrl, comfyuiSavedWorkflows, comfyuiActiveWorkflow, replicateApiKey, replicateDefaultModel, replicateAspectRatio, replicateInferenceSteps, nanobananaApiKey, nanobananaModel, nanobananaResolution, setGlobalProvider, setGlobalModel, setGlobalPromptPrefix, setGlobalProviderOptions, setComfyuiServerUrl, setComfyuiSavedWorkflows, setComfyuiActiveWorkflow, setReplicateApiKey, setReplicateDefaultModel, setReplicateAspectRatio, setReplicateInferenceSteps, setNanobananaApiKey, setNanobananaModel, setNanobananaResolution }
}, {
  synced: {
    state: true,
    actions: ['setGlobalProvider', 'setGlobalModel', 'setGlobalPromptPrefix', 'setGlobalProviderOptions', 'setComfyuiServerUrl', 'setComfyuiSavedWorkflows', 'setComfyuiActiveWorkflow', 'setReplicateApiKey', 'setReplicateDefaultModel', 'setReplicateAspectRatio', 'setReplicateInferenceSteps', 'setNanobananaApiKey', 'setNanobananaModel', 'setNanobananaResolution'],
  },
})
