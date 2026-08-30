import type {
  ModelConnectionErrorFields,
  ModelDiscoveryResult,
  ModelGenerationValidationResult,
} from '@proj-airi/core-agent'

import type {
  CustomModelAuth,
  CustomModelConfigErrorCode,
  CustomModelConnectionConfig,
  CustomModelProtocol,
  CustomModelReference,
  ValidateCustomModelConnectionOptions,
} from './config'

import {
  createBrowserRequestBlockedDiagnostics,
  redactSecretText,
} from '@proj-airi/core-agent'

import {
  buildCustomModelRequestUrl,
  createDefaultCustomModelConnection,
  CUSTOM_MODEL_DEFINITION_ID,
  CustomModelConfigError,
  defaultCustomModelPaths,
  validateCustomModelConnection,
} from './config'

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01'
const emptyDiscoveredModels: Array<{ id: string, name?: string }> = []
Object.freeze(emptyDiscoveredModels)

/** One header row in the Custom Model editor. */
export interface CustomModelHeaderDraft {
  key: string
  value: string
}

/** One model row in the Custom Model editor. */
export interface CustomModelModelDraft {
  id: string
  name: string
}

/**
 * Editable form state for one Custom Model connection.
 *
 * The draft can be incomplete. Persistence still requires
 * {@link validateCustomModelConnection}.
 */
export interface CustomModelEditorDraft {
  name: string
  protocol: CustomModelProtocol
  baseUrl: string
  generationPath: string
  modelListPath: string
  authType: CustomModelAuth['type']
  authSecret: string
  headers: CustomModelHeaderDraft[]
  models: CustomModelModelDraft[]
  anthropicVersion: string
  selectedModelId: string
}

/** Request URL preview derived from the current draft. */
export interface CustomModelUrlPreview {
  generationUrl: string
  modelListUrl: string
}

/** Discovery extras that the user can add without replacing saved model IDs. */
export interface CustomModelDiscoveryPartition {
  alreadySaved: Array<{ id: string, name?: string }>
  newModels: Array<{ id: string, name?: string }>
}

function asRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return {}
  return value as Record<string, unknown>
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/**
 * Returns true when the id belongs to the Custom Model definition.
 *
 * @example
 * isCustomModelDefinitionId('custom-model')
 * // => true
 */
export function isCustomModelDefinitionId(definitionId: string): boolean {
  return definitionId === CUSTOM_MODEL_DEFINITION_ID
}

/**
 * Reads saved model IDs from a Custom Model config object.
 *
 * @example
 * customModelModelsFromConfig({ models: [{ id: 'gpt-test', name: 'Test' }] })
 * // => [{ id: 'gpt-test', name: 'Test' }]
 */
export function customModelModelsFromConfig(config: Record<string, unknown> | undefined): CustomModelReference[] {
  const models = config?.models
  if (!Array.isArray(models))
    return []

  const seen = new Set<string>()
  const result: CustomModelReference[] = []
  for (const model of models) {
    if (!model || typeof model !== 'object')
      continue
    const id = asString((model as { id?: unknown }).id).trim()
    if (!id || seen.has(id))
      continue
    seen.add(id)
    const name = asString((model as { name?: unknown }).name).trim()
    result.push(name ? { id, name } : { id })
  }
  return result
}

/**
 * Builds editor draft state from a stored provider instance.
 */
export function createCustomModelEditorDraft(input: {
  name: string
  config?: Record<string, unknown>
}): CustomModelEditorDraft {
  const config = asRecord(input.config)
  const fallback = createDefaultCustomModelConnection()
  const protocol = isCustomModelProtocol(config.protocol) ? config.protocol : fallback.protocol
  const paths = defaultCustomModelPaths(protocol)
  const auth = asRecord(config.auth)
  const models = customModelModelsFromConfig(config).map(model => ({
    id: model.id,
    name: model.name ?? '',
  }))
  const headers = headerDraftFromRecord(
    config.headers && typeof config.headers === 'object' && !Array.isArray(config.headers)
      ? config.headers as Record<string, unknown>
      : {},
  )

  return {
    name: input.name,
    protocol,
    baseUrl: asString(config.baseUrl),
    generationPath: asString(config.generationPath) || paths.generationPath,
    modelListPath: config.modelListPath === undefined
      ? paths.modelListPath
      : asString(config.modelListPath),
    authType: isAuthType(auth.type) ? auth.type : 'bearer',
    authSecret: asString(auth.secret),
    headers: ensureTrailingHeaderRow(headers),
    models: models.length > 0 ? models : [{ id: '', name: '' }],
    anthropicVersion: asString(asRecord(config.protocolOptions).anthropicVersion) || DEFAULT_ANTHROPIC_VERSION,
    selectedModelId: models[0]?.id ?? '',
  }
}

/**
 * Applies protocol default paths when the current paths still match the previous protocol.
 *
 * Saved model IDs stay unchanged.
 */
export function applyCustomModelProtocolChange(
  draft: CustomModelEditorDraft,
  protocol: CustomModelProtocol,
): CustomModelEditorDraft {
  const previousPaths = defaultCustomModelPaths(draft.protocol)
  const nextPaths = defaultCustomModelPaths(protocol)
  const generationPath = draft.generationPath.trim() === previousPaths.generationPath
    ? nextPaths.generationPath
    : draft.generationPath
  const modelListPath = draft.modelListPath.trim() === previousPaths.modelListPath
    ? nextPaths.modelListPath
    : draft.modelListPath

  return {
    ...draft,
    protocol,
    generationPath,
    modelListPath,
    anthropicVersion: protocol === 'anthropic-messages'
      ? (draft.anthropicVersion.trim() || DEFAULT_ANTHROPIC_VERSION)
      : draft.anthropicVersion,
  }
}

/**
 * Builds the persistence payload from editor draft state.
 */
export function customModelDraftToConnectionInput(draft: CustomModelEditorDraft): unknown {
  const headers = Object.fromEntries(
    draft.headers
      .map(header => [header.key.trim(), header.value] as const)
      .filter(([key]) => key.length > 0),
  )
  const models = draft.models
    .map(model => ({
      id: model.id.trim(),
      ...(model.name.trim() ? { name: model.name.trim() } : {}),
    }))
    .filter(model => model.id.length > 0)

  return {
    protocol: draft.protocol,
    baseUrl: draft.baseUrl,
    generationPath: draft.generationPath,
    ...(draft.modelListPath.trim() ? { modelListPath: draft.modelListPath } : {}),
    auth: {
      type: draft.authType,
      ...(draft.authType === 'none' || !draft.authSecret.trim()
        ? {}
        : { secret: draft.authSecret }),
    },
    headers,
    models,
    ...(draft.protocol === 'anthropic-messages'
      ? { protocolOptions: { anthropicVersion: draft.anthropicVersion.trim() || DEFAULT_ANTHROPIC_VERSION } }
      : {}),
  }
}

/**
 * Validates the current draft and returns a persistable connection.
 *
 * Discovery can pass `{ requireModels: false, requireAuth: false }`. Save
 * and generation keep the default and still require a model ID and API Key.
 */
export function validateCustomModelEditorDraft(
  draft: CustomModelEditorDraft,
  options?: ValidateCustomModelConnectionOptions,
) {
  return validateCustomModelConnection(customModelDraftToConnectionInput(draft), options)
}

/**
 * Builds request URL previews without requiring a complete connection.
 */
export function previewCustomModelUrls(draft: Pick<CustomModelEditorDraft, 'baseUrl' | 'generationPath' | 'modelListPath'>): CustomModelUrlPreview {
  return {
    generationUrl: previewRequestUrl(draft.baseUrl, draft.generationPath),
    modelListUrl: draft.modelListPath.trim()
      ? previewRequestUrl(draft.baseUrl, draft.modelListPath)
      : '',
  }
}

/**
 * Writes discovered models into the editor list.
 *
 * Existing model IDs stay. New IDs are appended. Empty rows are removed.
 * If no model is selected, the first ID becomes the generation-test model.
 */
export function applyDiscoveredCustomModels(
  draft: CustomModelEditorDraft,
  discovered: Array<{ id: string, name?: string }> | undefined,
): CustomModelEditorDraft {
  const next: CustomModelModelDraft[] = []
  const seen = new Set<string>()

  for (const model of draft.models) {
    const id = model.id.trim()
    if (!id || seen.has(id))
      continue
    seen.add(id)
    next.push({ id, name: model.name.trim() })
  }

  for (const model of discovered ?? emptyDiscoveredModels) {
    const id = model.id.trim()
    if (!id)
      continue
    const name = model.name?.trim() ?? ''
    const existing = next.find(entry => entry.id === id)
    if (existing) {
      if (!existing.name && name)
        existing.name = name
      continue
    }
    seen.add(id)
    next.push({ id, name })
  }

  if (next.length === 0)
    next.push({ id: '', name: '' })

  const selected = draft.selectedModelId.trim()
  const selectedModelId = selected && next.some(model => model.id === selected)
    ? selected
    : (next.find(model => model.id)?.id ?? '')

  return {
    ...draft,
    models: next,
    selectedModelId,
  }
}

/**
 * Splits discovery results so user-entered model IDs are never replaced.
 */
export function partitionDiscoveredCustomModels(
  userModels: Array<{ id: string }>,
  discovered: Array<{ id: string, name?: string }> | undefined,
): CustomModelDiscoveryPartition {
  const savedIds = new Set(
    userModels
      .map(model => model.id.trim())
      .filter(Boolean),
  )
  const alreadySaved: Array<{ id: string, name?: string }> = []
  const newModels: Array<{ id: string, name?: string }> = []
  const seen = new Set<string>()

  for (const model of discovered ?? emptyDiscoveredModels) {
    const id = model.id.trim()
    if (!id || seen.has(id))
      continue
    seen.add(id)
    const entry = model.name?.trim() ? { id, name: model.name.trim() } : { id }
    if (savedIds.has(id))
      alreadySaved.push(entry)
    else
      newModels.push(entry)
  }

  return { alreadySaved, newModels }
}

/**
 * Adds a model ID to the draft without removing existing rows.
 */
export function addCustomModelDraftModel(
  models: CustomModelModelDraft[],
  model: { id: string, name?: string },
): CustomModelModelDraft[] {
  const id = model.id.trim()
  if (!id)
    return models
  if (models.some(entry => entry.id.trim() === id))
    return models

  const next = models.filter(entry => entry.id.trim().length > 0)
  next.push({ id, name: model.name?.trim() ?? '' })
  return next
}

/**
 * Keeps one empty trailing header row for new input.
 */
export function ensureTrailingHeaderRow(headers: CustomModelHeaderDraft[]): CustomModelHeaderDraft[] {
  const rows = headers.map(header => ({ key: header.key, value: header.value }))
  const last = rows.at(-1)
  if (!last || last.key.trim() || last.value.trim())
    rows.push({ key: '', value: '' })
  return rows
}

/**
 * Redacts a diagnostic string before the UI shows it.
 *
 * @example
 * redactCustomModelErrorText('Unauthorized Bearer sk-live')
 * // => 'Unauthorized Bearer [redacted]'
 */
export function redactCustomModelErrorText(value: string): string {
  return redactSecretText(value)
}

/**
 * Returns CORS, network, and TLS copy keys for a browser-blocked failure.
 */
export function customModelBrowserBlockedPresentation() {
  const diagnostics = createBrowserRequestBlockedDiagnostics()
  return {
    causes: diagnostics.possibleCauses,
    nextStepKeys: [
      'cors',
      'network',
      'tls',
      'electron',
    ] as const,
  }
}

/**
 * Maps a discovery result to UI status without changing saved models.
 */
export function customModelDiscoveryStatusFromResult(result: ModelDiscoveryResult): ModelDiscoveryResult['status'] {
  return result.status
}

/**
 * Returns true when a generation test still matches the current draft.
 */
export function isCustomModelGenerationCurrent(
  draft: CustomModelEditorDraft,
  testedFingerprint: string | undefined,
): boolean {
  return !!testedFingerprint && testedFingerprint === customModelDraftFingerprint(draft)
}

/**
 * Builds a fingerprint of request-affecting draft fields.
 */
export function customModelDraftFingerprint(draft: CustomModelEditorDraft): string {
  const validated = validateCustomModelEditorDraft(draft)
  if (!validated.success)
    return `invalid:${JSON.stringify(customModelDraftToConnectionInput(draft))}`

  return JSON.stringify({
    protocol: validated.output.protocol,
    baseUrl: validated.output.baseUrl,
    generationPath: validated.output.generationPath,
    modelListPath: validated.output.modelListPath ?? '',
    authType: validated.output.auth.type,
    authSecret: validated.output.auth.secret ?? '',
    headers: validated.output.headers,
    models: validated.output.models.map(model => model.id).sort(),
    anthropicVersion: validated.output.protocolOptions?.anthropicVersion ?? '',
    selectedModelId: draft.selectedModelId.trim(),
  })
}

/**
 * Clones a validated connection so chat cannot observe later edits.
 */
export function snapshotCustomModelConnection(config: unknown): CustomModelConnectionConfig {
  const result = validateCustomModelConnection(config)
  if (!result.success)
    throw new CustomModelConfigError(result.code, result.field)

  return structuredClone(result.output)
}

/**
 * Picks the model ID used by a generation test.
 */
export function resolveCustomModelTestModelId(draft: CustomModelEditorDraft): string {
  const selected = draft.selectedModelId.trim()
  if (selected && draft.models.some(model => model.id.trim() === selected))
    return selected

  return draft.models.map(model => model.id.trim()).find(Boolean) ?? ''
}

/**
 * Returns a redacted diagnostic from a generation or discovery failure.
 */
export function presentCustomModelConnectionError(error: ModelConnectionErrorFields): ModelConnectionErrorFields {
  return {
    ...error,
    message: redactCustomModelErrorText(error.message),
  }
}

export interface CustomModelConfigFieldError {
  code: CustomModelConfigErrorCode
  field: string
}

export function customModelConfigErrorFromDraft(draft: CustomModelEditorDraft): CustomModelConfigFieldError | undefined {
  const result = validateCustomModelEditorDraft(draft)
  if (result.success)
    return undefined
  return { code: result.code, field: result.field }
}

export function isSuccessfulGeneration(result: ModelGenerationValidationResult): result is { success: true } {
  return result.success
}

function previewRequestUrl(baseUrl: string, operationPath: string): string {
  try {
    return buildCustomModelRequestUrl(baseUrl, operationPath)
  }
  catch {
    return ''
  }
}

function headerDraftFromRecord(headers: Record<string, unknown>): CustomModelHeaderDraft[] {
  return Object.entries(headers).map(([key, value]) => ({
    key,
    value: asString(value),
  }))
}

function isCustomModelProtocol(value: unknown): value is CustomModelProtocol {
  return value === 'openai-chat-completions'
    || value === 'openai-responses'
    || value === 'anthropic-messages'
}

function isAuthType(value: unknown): value is CustomModelAuth['type'] {
  return value === 'bearer' || value === 'x-api-key' || value === 'none'
}
