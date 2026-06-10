import type {
  AdminRouterAzureSlice,
  AdminRouterConfigRequest,
  AdminRouterConfigSlice,
  AdminRouterDashscopeSlice,
  AdminRouterOpenRouterSlice,
  AdminRouterStepfunSlice,
  AdminRouterUnspeechSlice,
} from './api'

import { errorMessageFromUnknown } from '@proj-airi/stage-shared'

export type RouterConfigMode = 'merge' | 'reset'
export type RouterSliceKind = AdminRouterConfigSlice['kind']
export type DashscopeRegion = AdminRouterDashscopeSlice['region']
export type StepfunModel = NonNullable<AdminRouterStepfunSlice['upstreamModel']>

export interface RouterDefaultsDraft {
  chatModel: string
  ttsModel: string
  ttsVoicesJson: string
}

interface SliceDraftBase {
  id: string
  kind: RouterSliceKind
}

export interface OpenRouterSliceDraft extends SliceDraftBase {
  kind: 'openrouter'
  modelName: string
  overrideModel: string
  plaintextKey: string
  baseURL: string
  keyEntryId: string
  existingKeyEntryId: string
  headerTemplate: string
}

export interface AzureSliceDraft extends SliceDraftBase {
  kind: 'azure'
  modelName: string
  region: string
  defaultVoice: string
  plaintextKey: string
  keyEntryId: string
  existingKeyEntryId: string
}

export interface DashscopeSliceDraft extends SliceDraftBase {
  kind: 'dashscope-cosyvoice'
  modelName: string
  region: DashscopeRegion
  upstreamModel: string
  plaintextKey: string
  keyEntryId: string
  existingKeyEntryId: string
}

export interface StepfunSliceDraft extends SliceDraftBase {
  kind: 'stepfun'
  modelName: string
  upstreamModel: StepfunModel
  defaultVoice: string
  instruction: string
  plaintextKey: string
  keyEntryId: string
  existingKeyEntryId: string
}

export interface UnspeechSliceDraft extends SliceDraftBase {
  kind: 'unspeech'
  restBaseURL: string
  streamingEnabled: boolean
  streamingUpstreamURL: string
  streamingPlaintextKey: string
  streamingKeyEntryId: string
  streamingExistingKeyEntryId: string
  streamingModelsJson: string
  streamingDefaultModel: string
}

export type RouterSliceDraft
  = | OpenRouterSliceDraft
    | AzureSliceDraft
    | DashscopeSliceDraft
    | StepfunSliceDraft
    | UnspeechSliceDraft

export interface RouterConfigFormState {
  mode: RouterConfigMode
  slices: RouterSliceDraft[]
  defaults: RouterDefaultsDraft
}

export interface RouterConfigBuildResult {
  request: AdminRouterConfigRequest | null
  errors: string[]
}

const DEFAULT_TTS_VOICES_JSON = '{\n  "alibaba/cosyvoice-v2": {\n    "zh-CN": "longxiaochun_v2"\n  }\n}'
const DEFAULT_STREAMING_MODELS_JSON = '[\n  {\n    "id": "volcengine/seed-tts-2.0",\n    "name": "Seed TTS 2.0"\n  }\n]'

let draftId = 0

export const ROUTER_SLICE_KIND_OPTIONS: Array<{ label: string, value: RouterSliceKind, description: string }> = [
  { label: 'OpenRouter', value: 'openrouter', description: 'LLM chat model alias' },
  { label: 'Azure Speech', value: 'azure', description: 'Microsoft TTS model alias' },
  { label: 'DashScope CosyVoice', value: 'dashscope-cosyvoice', description: 'Alibaba TTS model alias' },
  { label: 'StepFun TTS', value: 'stepfun', description: 'StepAudio / Step TTS model alias' },
  { label: 'UnSpeech', value: 'unspeech', description: 'REST and optional streaming TTS upstream' },
]

export const DASHSCOPE_REGION_OPTIONS: Array<{ label: string, value: DashscopeRegion, description: string }> = [
  { label: 'International', value: 'intl', description: 'dashscope-intl.aliyuncs.com' },
  { label: 'China', value: 'cn', description: 'dashscope.aliyuncs.com' },
]

export const STEPFUN_MODEL_OPTIONS: Array<{ label: string, value: StepfunModel }> = [
  { label: 'StepAudio 2.5 TTS', value: 'stepaudio-2.5-tts' },
  { label: 'Step TTS 2', value: 'step-tts-2' },
  { label: 'Step TTS Mini', value: 'step-tts-mini' },
]

/**
 * Creates the default LLM Router form state.
 *
 * Use when:
 * - The admin page needs a fresh editable request with the common OpenRouter
 *   chat-default path prefilled.
 *
 * Returns:
 * - Mutable form state that can be compiled by {@link buildRouterConfigRequest}.
 */
export function createRouterConfigFormState(): RouterConfigFormState {
  return {
    mode: 'merge',
    slices: [createRouterSliceDraft('openrouter')],
    defaults: {
      chatModel: 'chat-default',
      ttsModel: '',
      ttsVoicesJson: '',
    },
  }
}

/**
 * Creates an editable provider slice draft.
 *
 * Use when:
 * - The admin adds a provider card or imports a supported JSON slice.
 *
 * Returns:
 * - A draft with provider-specific operational defaults.
 */
export function createRouterSliceDraft(kind: 'openrouter', id?: string): OpenRouterSliceDraft
export function createRouterSliceDraft(kind: 'azure', id?: string): AzureSliceDraft
export function createRouterSliceDraft(kind: 'dashscope-cosyvoice', id?: string): DashscopeSliceDraft
export function createRouterSliceDraft(kind: 'stepfun', id?: string): StepfunSliceDraft
export function createRouterSliceDraft(kind: 'unspeech', id?: string): UnspeechSliceDraft
export function createRouterSliceDraft(kind: RouterSliceKind, id?: string): RouterSliceDraft
export function createRouterSliceDraft(kind: RouterSliceKind, id?: string): RouterSliceDraft {
  const sliceId = id ?? `${kind}-${++draftId}`
  switch (kind) {
    case 'openrouter':
      return {
        id: sliceId,
        kind,
        modelName: 'chat-default',
        overrideModel: 'openai/gpt-4o-mini',
        plaintextKey: '',
        baseURL: 'https://openrouter.ai/api/v1',
        keyEntryId: '',
        existingKeyEntryId: '',
        headerTemplate: '',
      }
    case 'azure':
      return {
        id: sliceId,
        kind,
        modelName: 'microsoft/v1',
        region: 'eastasia',
        defaultVoice: '',
        plaintextKey: '',
        keyEntryId: '',
        existingKeyEntryId: '',
      }
    case 'dashscope-cosyvoice':
      return {
        id: sliceId,
        kind,
        modelName: 'alibaba/cosyvoice-v2',
        region: 'intl',
        upstreamModel: 'cosyvoice-v2',
        plaintextKey: '',
        keyEntryId: '',
        existingKeyEntryId: '',
      }
    case 'stepfun':
      return {
        id: sliceId,
        kind,
        modelName: 'stepfun/stepaudio-2.5-tts',
        upstreamModel: 'stepaudio-2.5-tts',
        defaultVoice: '',
        instruction: '',
        plaintextKey: '',
        keyEntryId: '',
        existingKeyEntryId: '',
      }
    case 'unspeech':
      return {
        id: sliceId,
        kind,
        restBaseURL: 'http://airi-unspeech.railway.internal:5933',
        streamingEnabled: false,
        streamingUpstreamURL: 'ws://airi-unspeech.railway.internal:5933/v1/audio/speech/stream',
        streamingPlaintextKey: '',
        streamingKeyEntryId: '',
        streamingExistingKeyEntryId: '',
        streamingModelsJson: DEFAULT_STREAMING_MODELS_JSON,
        streamingDefaultModel: '',
      }
  }
}

export function defaultTtsVoicesJson(): string {
  return DEFAULT_TTS_VOICES_JSON
}

/**
 * Builds the admin router config request from form state.
 *
 * Use when:
 * - Previewing or applying the visible form payload.
 *
 * Expects:
 * - Plaintext keys are present in draft state only; callers should submit the
 *   returned request directly and avoid rendering it in normal summaries.
 *
 * Returns:
 * - A request when client-side validation passes, otherwise actionable errors.
 */
export function buildRouterConfigRequest(form: RouterConfigFormState): RouterConfigBuildResult {
  const errors = validateRouterConfigForm(form)
  if (errors.length > 0)
    return { request: null, errors }

  return { request: routerConfigRequestFromFormDraft(form), errors: [] }
}

/**
 * Projects form state into request JSON without validating it first.
 *
 * Use when:
 * - The UI needs to export the current draft for inspection before all
 *   required fields are complete.
 *
 * Returns:
 * - The request shape the validated builder would submit once errors are fixed.
 */
export function routerConfigRequestFromFormDraft(form: RouterConfigFormState): AdminRouterConfigRequest {
  const slices = form.slices.map(sliceToRequest)
  const defaults = defaultsToRequest(form.defaults)
  return {
    mode: form.mode,
    slices,
    ...(Object.keys(defaults).length > 0 ? { defaults } : {}),
  }
}

export function validateRouterConfigForm(form: RouterConfigFormState): string[] {
  const errors: string[] = []
  const unspeechCount = form.slices.filter(slice => slice.kind === 'unspeech').length
  if (unspeechCount > 1)
    errors.push('Only one UnSpeech slice can be submitted at a time.')

  for (const [index, slice] of form.slices.entries())
    errors.push(...validateSlice(slice, index + 1))

  validateDefaults(form.defaults, errors)

  const hasDefaults = hasText(form.defaults.chatModel) || hasText(form.defaults.ttsModel) || hasText(form.defaults.ttsVoicesJson)
  if (form.slices.length === 0 && !hasDefaults)
    errors.push('Add at least one provider slice or default alias before previewing.')

  return errors
}

/**
 * Imports supported router config request JSON into editable form state.
 *
 * Before:
 * - `{ "mode": "merge", "slices": [{ "kind": "openrouter", ... }] }`
 *
 * After:
 * - Form state with one OpenRouter draft and matching defaults.
 */
export function formStateFromRequestJson(json: string): RouterConfigFormState {
  const parsed = JSON.parse(json) as unknown
  if (!isRecord(parsed))
    throw new Error('Advanced JSON must be an object.')

  const mode = parsed.mode === 'reset' ? 'reset' : 'merge'
  const slicesValue = parsed.slices
  const slices = Array.isArray(slicesValue)
    ? slicesValue.map((slice, index) => draftFromRequestSlice(slice, index + 1))
    : []

  return {
    mode,
    slices,
    defaults: defaultsFromUnknown(parsed.defaults),
  }
}

export function formatRouterConfigRequestJson(request: AdminRouterConfigRequest): string {
  return JSON.stringify(request, null, 2)
}

function validateSlice(slice: RouterSliceDraft, ordinal: number): string[] {
  const label = `Slice ${ordinal} (${kindLabel(slice.kind)})`
  switch (slice.kind) {
    case 'openrouter':
      return [
        required(slice.modelName, `${label}: model alias is required.`),
        noPipe(slice.modelName, `${label}: model alias must not contain "|".`),
        required(slice.overrideModel, `${label}: upstream model is required.`),
        requiredKey(slice.plaintextKey, slice.existingKeyEntryId, `${label}: provider key is required unless an existing key is loaded.`),
        httpUrl(slice.baseURL, `${label}: base URL must start with http:// or https://.`),
      ].filter(isPresent)
    case 'azure':
      return [
        required(slice.modelName, `${label}: model alias is required.`),
        noPipe(slice.modelName, `${label}: model alias must not contain "|".`),
        required(slice.region, `${label}: Azure region is required.`),
        requiredKey(slice.plaintextKey, slice.existingKeyEntryId, `${label}: provider key is required unless an existing key is loaded.`),
      ].filter(isPresent)
    case 'dashscope-cosyvoice':
      return [
        required(slice.modelName, `${label}: model alias is required.`),
        noPipe(slice.modelName, `${label}: model alias must not contain "|".`),
        required(slice.upstreamModel, `${label}: upstream model is required.`),
        requiredKey(slice.plaintextKey, slice.existingKeyEntryId, `${label}: provider key is required unless an existing key is loaded.`),
      ].filter(isPresent)
    case 'stepfun':
      return [
        required(slice.modelName, `${label}: model alias is required.`),
        noPipe(slice.modelName, `${label}: model alias must not contain "|".`),
        requiredKey(slice.plaintextKey, slice.existingKeyEntryId, `${label}: provider key is required unless an existing key is loaded.`),
      ].filter(isPresent)
    case 'unspeech':
      return [
        required(slice.restBaseURL, `${label}: REST base URL is required.`),
        httpUrl(slice.restBaseURL, `${label}: REST base URL must start with http:// or https://.`),
        ...(slice.streamingEnabled
          ? [
              required(slice.streamingUpstreamURL, `${label}: streaming WebSocket URL is required.`),
              wsUrl(slice.streamingUpstreamURL, `${label}: streaming URL must start with ws:// or wss://.`),
              requiredKey(slice.streamingPlaintextKey, slice.streamingExistingKeyEntryId, `${label}: streaming provider key is required unless an existing key is loaded.`),
              validateStreamingModels(slice.streamingModelsJson, label),
            ].filter(isPresent)
          : []),
      ].filter(isPresent)
  }
}

function validateDefaults(defaults: RouterDefaultsDraft, errors: string[]) {
  if (!hasText(defaults.ttsVoicesJson))
    return
  try {
    parseTtsVoices(defaults.ttsVoicesJson)
  }
  catch (error) {
    errors.push(errorMessageFromUnknown(error, 'Default TTS voices must be valid JSON.'))
  }
}

function validateStreamingModels(json: string, label: string): string | undefined {
  if (!hasText(json))
    return undefined
  try {
    parseStreamingModels(json)
    return undefined
  }
  catch (error) {
    return error instanceof Error ? `${label}: ${error.message}` : `${label}: streaming models must be valid JSON.`
  }
}

function sliceToRequest(slice: RouterSliceDraft): AdminRouterConfigSlice {
  switch (slice.kind) {
    case 'openrouter': {
      const request: AdminRouterOpenRouterSlice = {
        kind: slice.kind,
        modelName: trim(slice.modelName),
        overrideModel: trim(slice.overrideModel),
        baseURL: trim(slice.baseURL),
      }
      assignOptional(request, 'plaintextKey', slice.plaintextKey)
      assignOptional(request, 'keyEntryId', slice.keyEntryId)
      assignOptional(request, 'existingKeyEntryId', slice.existingKeyEntryId)
      assignOptional(request, 'headerTemplate', slice.headerTemplate)
      return request
    }
    case 'azure': {
      const request: AdminRouterAzureSlice = {
        kind: slice.kind,
        modelName: trim(slice.modelName),
        region: trim(slice.region),
      }
      assignOptional(request, 'plaintextKey', slice.plaintextKey)
      assignOptional(request, 'defaultVoice', slice.defaultVoice)
      assignOptional(request, 'keyEntryId', slice.keyEntryId)
      assignOptional(request, 'existingKeyEntryId', slice.existingKeyEntryId)
      return request
    }
    case 'dashscope-cosyvoice': {
      const request: AdminRouterDashscopeSlice = {
        kind: slice.kind,
        modelName: trim(slice.modelName),
        region: slice.region,
        upstreamModel: trim(slice.upstreamModel),
      }
      assignOptional(request, 'plaintextKey', slice.plaintextKey)
      assignOptional(request, 'keyEntryId', slice.keyEntryId)
      assignOptional(request, 'existingKeyEntryId', slice.existingKeyEntryId)
      return request
    }
    case 'stepfun': {
      const request: AdminRouterStepfunSlice = {
        kind: slice.kind,
        modelName: trim(slice.modelName),
        upstreamModel: slice.upstreamModel,
      }
      assignOptional(request, 'plaintextKey', slice.plaintextKey)
      assignOptional(request, 'defaultVoice', slice.defaultVoice)
      assignOptional(request, 'instruction', slice.instruction)
      assignOptional(request, 'keyEntryId', slice.keyEntryId)
      assignOptional(request, 'existingKeyEntryId', slice.existingKeyEntryId)
      return request
    }
    case 'unspeech': {
      const request: AdminRouterUnspeechSlice = {
        kind: slice.kind,
        restBaseURL: trim(slice.restBaseURL),
      }
      if (slice.streamingEnabled) {
        request.streaming = {
          upstreamURL: trim(slice.streamingUpstreamURL),
        }
        assignOptional(request.streaming, 'plaintextKey', slice.streamingPlaintextKey)
        assignOptional(request.streaming, 'keyEntryId', slice.streamingKeyEntryId)
        assignOptional(request.streaming, 'existingKeyEntryId', slice.streamingExistingKeyEntryId)
        assignOptional(request.streaming, 'defaultModel', slice.streamingDefaultModel)
        const models = parseStreamingModels(slice.streamingModelsJson)
        if (models.length > 0)
          request.streaming.models = models
      }
      return request
    }
  }
}

function defaultsToRequest(defaults: RouterDefaultsDraft): NonNullable<AdminRouterConfigRequest['defaults']> {
  const out: NonNullable<AdminRouterConfigRequest['defaults']> = {}
  assignOptional(out, 'chatModel', defaults.chatModel)
  assignOptional(out, 'ttsModel', defaults.ttsModel)
  if (hasText(defaults.ttsVoicesJson))
    out.ttsVoices = parseTtsVoices(defaults.ttsVoicesJson)
  return out
}

function draftFromRequestSlice(value: unknown, ordinal: number): RouterSliceDraft {
  if (!isRecord(value) || typeof value.kind !== 'string')
    throw new Error(`slices[${ordinal - 1}] must include a supported kind.`)

  switch (value.kind) {
    case 'openrouter': {
      const draft = createRouterSliceDraft('openrouter', `imported-openrouter-${ordinal}`) as OpenRouterSliceDraft
      draft.modelName = stringValue(value.modelName)
      draft.overrideModel = stringValue(value.overrideModel)
      draft.plaintextKey = stringValue(value.plaintextKey)
      draft.baseURL = stringValue(value.baseURL) || draft.baseURL
      draft.keyEntryId = stringValue(value.keyEntryId)
      draft.existingKeyEntryId = stringValue(value.existingKeyEntryId)
      draft.headerTemplate = stringValue(value.headerTemplate)
      return draft
    }
    case 'azure': {
      const draft = createRouterSliceDraft('azure', `imported-azure-${ordinal}`) as AzureSliceDraft
      draft.modelName = stringValue(value.modelName)
      draft.region = stringValue(value.region)
      draft.defaultVoice = stringValue(value.defaultVoice)
      draft.plaintextKey = stringValue(value.plaintextKey)
      draft.keyEntryId = stringValue(value.keyEntryId)
      draft.existingKeyEntryId = stringValue(value.existingKeyEntryId)
      return draft
    }
    case 'dashscope-cosyvoice': {
      const draft = createRouterSliceDraft('dashscope-cosyvoice', `imported-dashscope-${ordinal}`) as DashscopeSliceDraft
      draft.modelName = stringValue(value.modelName)
      draft.region = value.region === 'cn' ? 'cn' : 'intl'
      draft.upstreamModel = stringValue(value.upstreamModel)
      draft.plaintextKey = stringValue(value.plaintextKey)
      draft.keyEntryId = stringValue(value.keyEntryId)
      draft.existingKeyEntryId = stringValue(value.existingKeyEntryId)
      return draft
    }
    case 'stepfun': {
      const draft = createRouterSliceDraft('stepfun', `imported-stepfun-${ordinal}`) as StepfunSliceDraft
      draft.modelName = stringValue(value.modelName)
      draft.upstreamModel = isStepfunModel(value.upstreamModel) ? value.upstreamModel : draft.upstreamModel
      draft.defaultVoice = stringValue(value.defaultVoice)
      draft.instruction = stringValue(value.instruction)
      draft.plaintextKey = stringValue(value.plaintextKey)
      draft.keyEntryId = stringValue(value.keyEntryId)
      draft.existingKeyEntryId = stringValue(value.existingKeyEntryId)
      return draft
    }
    case 'unspeech': {
      const draft = createRouterSliceDraft('unspeech', `imported-unspeech-${ordinal}`) as UnspeechSliceDraft
      draft.restBaseURL = stringValue(value.restBaseURL)
      const streaming = isRecord(value.streaming) ? value.streaming : null
      draft.streamingEnabled = streaming != null
      if (streaming) {
        draft.streamingUpstreamURL = stringValue(streaming.upstreamURL)
        draft.streamingPlaintextKey = stringValue(streaming.plaintextKey)
        draft.streamingKeyEntryId = stringValue(streaming.keyEntryId)
        draft.streamingExistingKeyEntryId = stringValue(streaming.existingKeyEntryId)
        draft.streamingDefaultModel = stringValue(streaming.defaultModel)
        if (Array.isArray(streaming.models))
          draft.streamingModelsJson = JSON.stringify(streaming.models, null, 2)
      }
      return draft
    }
    default:
      throw new Error(`Unsupported router slice kind "${value.kind}".`)
  }
}

function defaultsFromUnknown(value: unknown): RouterDefaultsDraft {
  const defaults = isRecord(value) ? value : {}
  return {
    chatModel: stringValue(defaults.chatModel),
    ttsModel: stringValue(defaults.ttsModel),
    ttsVoicesJson: isRecord(defaults.ttsVoices) ? JSON.stringify(defaults.ttsVoices, null, 2) : '',
  }
}

function parseTtsVoices(json: string): Record<string, Record<string, string>> {
  const parsed = JSON.parse(json) as unknown
  if (!isRecord(parsed))
    throw new Error('Default TTS voices must be a JSON object.')

  const out: Record<string, Record<string, string>> = {}
  for (const [model, locales] of Object.entries(parsed)) {
    if (!model.trim() || !isRecord(locales))
      throw new Error('Default TTS voices must map model IDs to locale objects.')
    out[model] = {}
    for (const [locale, voice] of Object.entries(locales)) {
      if (!locale.trim() || typeof voice !== 'string' || !voice.trim())
        throw new Error('Default TTS voices locales must map to voice IDs.')
      out[model][locale] = voice
    }
  }
  return out
}

function parseStreamingModels(json: string): NonNullable<NonNullable<AdminRouterUnspeechSlice['streaming']>['models']> {
  if (!hasText(json))
    return []
  const parsed = JSON.parse(json) as unknown
  if (!Array.isArray(parsed))
    throw new Error('streaming models must be a JSON array.')

  return parsed.map((item, index) => {
    if (!isRecord(item) || typeof item.id !== 'string' || !item.id.trim())
      throw new Error(`streaming models[${index}].id is required.`)

    return {
      id: item.id,
      ...(typeof item.name === 'string' && item.name.trim() ? { name: item.name } : {}),
      ...(typeof item.description === 'string' && item.description.trim() ? { description: item.description } : {}),
    }
  })
}

function kindLabel(kind: RouterSliceKind): string {
  return ROUTER_SLICE_KIND_OPTIONS.find(option => option.value === kind)?.label ?? kind
}

function required(value: string, message: string): string | undefined {
  return hasText(value) ? undefined : message
}

function requiredKey(value: string, existingKeyEntryId: string, message: string): string | undefined {
  return hasText(value) || hasText(existingKeyEntryId) ? undefined : message
}

function noPipe(value: string, message: string): string | undefined {
  return value.includes('|') ? message : undefined
}

function httpUrl(value: string, message: string): string | undefined {
  return /^https?:\/\/\S+$/u.test(value.trim()) ? undefined : message
}

function wsUrl(value: string, message: string): string | undefined {
  return /^wss?:\/\/\S+$/u.test(value.trim()) ? undefined : message
}

function assignOptional<T extends object>(target: T, key: string, value: string) {
  if (hasText(value))
    Object.assign(target, { [key]: trim(value) })
}

function trim(value: string): string {
  return value.trim()
}

function hasText(value: string): boolean {
  return value.trim().length > 0
}

function isPresent(value: string | undefined): value is string {
  return value != null
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function isStepfunModel(value: unknown): value is StepfunModel {
  return value === 'stepaudio-2.5-tts' || value === 'step-tts-2' || value === 'step-tts-mini'
}
