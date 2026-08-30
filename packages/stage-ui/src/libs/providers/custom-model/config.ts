import type { ProviderValidationStatus } from '../types'

import {
  array,
  minLength,
  object,
  optional,
  picklist,
  pipe,
  record,
  safeParse,
  string,
  trim,
} from 'valibot'

export const CUSTOM_MODEL_DEFINITION_ID = 'custom-model'

export const CUSTOM_MODEL_PROTOCOLS = [
  'openai-chat-completions',
  'openai-responses',
  'anthropic-messages',
] as const

export type CustomModelProtocol = typeof CUSTOM_MODEL_PROTOCOLS[number]

/** Authentication configuration for one custom model connection. */
export interface CustomModelAuth {
  type: 'bearer' | 'x-api-key' | 'none'
  /**
   * Auth secret sent to the upstream service.
   *
   * Any non-empty string is valid after trim. AIRI does not check the key
   * format. If the remote rejects the key, the request error is reported.
   */
  secret?: string
}

/** User-defined model attached to one custom connection. */
export interface CustomModelReference {
  id: string
  name?: string
}

/** Local-only configuration for one custom model connection. */
export interface CustomModelConnectionConfig {
  protocol: CustomModelProtocol
  baseUrl: string
  generationPath: string
  modelListPath?: string
  auth: CustomModelAuth
  headers: Record<string, string>
  models: CustomModelReference[]
  protocolOptions?: {
    anthropicVersion?: string
  }
}

export type CustomModelConfigErrorCode
  = | 'invalid-structure'
    | 'invalid-url'
    | 'invalid-path'
    | 'invalid-header'
    | 'reserved-header'
    | 'auth-secret-required'
    | 'duplicate-model'
    | 'model-required'

/** Options for {@link validateCustomModelConnection}. */
export interface ValidateCustomModelConnectionOptions {
  /**
   * When false, an empty model list is valid. Discovery uses this path.
   *
   * Save and generation still require at least one model ID.
   *
   * @default true
   */
  requireModels?: boolean
  /**
   * When false, a missing API Key does not fail validation. Discovery uses
   * this path so a Base URL can list models before auth is complete.
   *
   * Save and generation still require an API Key when the auth type is not
   * `none`.
   *
   * @default true
   */
  requireAuth?: boolean
}

export type CustomModelConfigValidationResult
  = | { success: true, output: CustomModelConnectionConfig }
    | { success: false, code: CustomModelConfigErrorCode, field: string }

export interface CustomModelHeaderMergeInput {
  /**
   * Headers required by the current transport.
   *
   * @default {}
   */
  transport?: Record<string, string>
  protocol: CustomModelProtocol
  protocolOptions?: CustomModelConnectionConfig['protocolOptions']
  auth: CustomModelAuth
  user: Record<string, string>
}

export type CustomModelHeaderMergeResult
  = | { success: true, headers: Record<string, string> }
    | { success: false, code: 'reserved-header', field: string }

/**
 * Default operation paths for each custom model protocol.
 *
 * Relative paths keep the path that is already in the Base URL.
 */
export const CUSTOM_MODEL_DEFAULT_PATHS = {
  'openai-chat-completions': {
    generationPath: 'chat/completions',
    modelListPath: 'models',
  },
  'openai-responses': {
    generationPath: 'responses',
    modelListPath: 'models',
  },
  'anthropic-messages': {
    generationPath: 'messages',
    modelListPath: 'models',
  },
} as const satisfies Record<CustomModelProtocol, { generationPath: string, modelListPath: string }>

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01'

const connectionSchema = object({
  protocol: picklist(CUSTOM_MODEL_PROTOCOLS),
  baseUrl: pipe(string(), trim(), minLength(1)),
  generationPath: pipe(string(), trim(), minLength(1)),
  modelListPath: optional(pipe(string(), trim())),
  auth: object({
    type: picklist(['bearer', 'x-api-key', 'none']),
    secret: optional(string()),
  }),
  headers: record(string(), string()),
  models: array(object({
    id: pipe(string(), trim(), minLength(1)),
    name: optional(pipe(string(), trim())),
  })),
  protocolOptions: optional(object({
    anthropicVersion: optional(pipe(string(), trim())),
  })),
})

const reservedHeaderNames = new Set([
  'accept',
  'authorization',
  'connection',
  'content-length',
  'content-type',
  'cookie',
  'host',
  'proxy-authenticate',
  'proxy-authorization',
  'set-cookie',
  'transfer-encoding',
  'upgrade',
  'x-api-key',
  'anthropic-version',
])

/**
 * Configuration error for one custom model connection.
 *
 * Callers map `code` and `field` to localized UI text. The message never includes secret values.
 */
export class CustomModelConfigError extends Error {
  readonly code: CustomModelConfigErrorCode
  readonly field: string

  constructor(code: CustomModelConfigErrorCode, field: string) {
    super(`Invalid custom model connection (${code}) at ${field}.`)
    this.name = 'CustomModelConfigError'
    this.code = code
    this.field = field
  }
}

/**
 * Returns the default operation paths for a protocol.
 *
 * @example
 * defaultCustomModelPaths('openai-responses')
 * // => { generationPath: 'responses', modelListPath: 'models' }
 */
export function defaultCustomModelPaths(protocol: CustomModelProtocol) {
  return CUSTOM_MODEL_DEFAULT_PATHS[protocol]
}

/**
 * Builds an empty draft connection for a protocol.
 *
 * The draft is not valid for persistence until the user fills Base URL, auth, and a model ID.
 */
export function createDefaultCustomModelConnection(
  protocol: CustomModelProtocol = 'openai-chat-completions',
): CustomModelConnectionConfig {
  const paths = defaultCustomModelPaths(protocol)
  return {
    protocol,
    baseUrl: '',
    generationPath: paths.generationPath,
    modelListPath: paths.modelListPath,
    auth: { type: 'bearer' },
    headers: {},
    models: [],
    ...(protocol === 'anthropic-messages'
      ? { protocolOptions: { anthropicVersion: DEFAULT_ANTHROPIC_VERSION } }
      : {}),
  }
}

/**
 * Builds an operation URL without dropping the path in the configured base URL.
 *
 * @example
 * buildCustomModelRequestUrl('https://example.com/gateway/v1', '/responses')
 * // => 'https://example.com/gateway/v1/responses'
 */
export function buildCustomModelRequestUrl(baseUrl: string, operationPath: string): string {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl)
  const normalizedPath = normalizeOperationPath(operationPath)
  if (!normalizedBaseUrl || !normalizedPath)
    throw new TypeError('Invalid custom model request URL.')

  return new URL(normalizedPath, normalizedBaseUrl).toString()
}

/**
 * Validates and normalizes a custom model connection before it is persisted.
 *
 * The result never includes values from an invalid configuration. Callers can
 * map the stable error code and field to localized UI text.
 *
 * Discovery can pass `{ requireModels: false, requireAuth: false }` so
 * GET /models can run from a Base URL before the user enters a model ID or
 * API Key.
 */
export function validateCustomModelConnection(
  input: unknown,
  options: ValidateCustomModelConnectionOptions = {},
): CustomModelConfigValidationResult {
  const parsed = safeParse(connectionSchema, input)
  if (!parsed.success) {
    return {
      success: false,
      code: 'invalid-structure',
      field: issuePath(parsed.issues[0]?.path),
    }
  }

  const baseUrl = normalizeBaseUrl(parsed.output.baseUrl)
  if (!baseUrl)
    return { success: false, code: 'invalid-url', field: 'baseUrl' }

  const generationPath = normalizeOperationPath(parsed.output.generationPath)
  if (!generationPath)
    return { success: false, code: 'invalid-path', field: 'generationPath' }

  let modelListPath: string | undefined
  if (parsed.output.modelListPath) {
    modelListPath = normalizeOperationPath(parsed.output.modelListPath)
    if (!modelListPath)
      return { success: false, code: 'invalid-path', field: 'modelListPath' }
  }

  // Any non-empty trimmed secret is valid. Key format is not checked.
  const secret = parsed.output.auth.secret?.trim()
  const requireAuth = options.requireAuth !== false
  if (requireAuth && parsed.output.auth.type !== 'none' && !secret)
    return { success: false, code: 'auth-secret-required', field: 'auth.secret' }

  const headers: Record<string, string> = {}
  const headerNames = new Map<string, string>()
  for (const [name, value] of Object.entries(parsed.output.headers)) {
    if (!isHeaderName(name))
      return { success: false, code: 'invalid-header', field: `headers.${name}` }
    if (!value.trim())
      return { success: false, code: 'invalid-header', field: `headers.${name}` }
    if (reservedHeaderNames.has(name.toLowerCase()))
      return { success: false, code: 'reserved-header', field: `headers.${name}` }

    const duplicateName = headerNames.get(name.toLowerCase())
    if (duplicateName)
      return { success: false, code: 'invalid-header', field: `headers.${name}` }

    headerNames.set(name.toLowerCase(), name)
    headers[name] = value.trim()
  }

  const requireModels = options.requireModels !== false
  const modelIds = new Set<string>()
  const models: CustomModelReference[] = []
  for (const [index, model] of parsed.output.models.entries()) {
    const id = model.id.trim()
    if (modelIds.has(id))
      return { success: false, code: 'duplicate-model', field: `models.${index}.id` }
    modelIds.add(id)
    models.push({
      id,
      ...(model.name ? { name: model.name.trim() } : {}),
    })
  }

  if (requireModels && models.length === 0)
    return { success: false, code: 'model-required', field: 'models' }

  const protocolOptions = parsed.output.protocolOptions
  const anthropicVersion = protocolOptions?.anthropicVersion?.trim()

  return {
    success: true,
    output: {
      protocol: parsed.output.protocol,
      baseUrl,
      generationPath,
      ...(modelListPath ? { modelListPath } : {}),
      auth: {
        type: parsed.output.auth.type,
        ...(secret ? { secret } : {}),
      },
      headers,
      models,
      ...(anthropicVersion
        ? { protocolOptions: { anthropicVersion } }
        : {}),
    },
  }
}

/**
 * Merges transport, protocol, auth, and user headers.
 *
 * User headers cannot replace the first three layers. A conflict fails the merge.
 *
 * @example
 * mergeCustomModelHeaders({
 *   protocol: 'openai-chat-completions',
 *   auth: { type: 'bearer', secret: 'sk-test' },
 *   user: { 'X-Client-Name': 'AIRI' },
 * })
 * // => { success: true, headers: { accept, content-type, authorization, 'X-Client-Name' } }
 */
export function mergeCustomModelHeaders(input: CustomModelHeaderMergeInput): CustomModelHeaderMergeResult {
  const transport = input.transport ?? {}
  const protocol = protocolHeaders(input.protocol, input.protocolOptions)
  const auth = authHeaders(input.auth)
  const reserved = new Set([
    ...reservedHeaderNames,
    ...Object.keys(transport).map(name => name.toLowerCase()),
    ...Object.keys(protocol).map(name => name.toLowerCase()),
    ...Object.keys(auth).map(name => name.toLowerCase()),
  ])

  for (const name of Object.keys(input.user)) {
    if (reserved.has(name.toLowerCase())) {
      return {
        success: false,
        code: 'reserved-header',
        field: `headers.${name}`,
      }
    }
  }

  return {
    success: true,
    headers: {
      ...transport,
      ...protocol,
      ...auth,
      ...input.user,
    },
  }
}

/**
 * Removes secrets from a connection before log, export, or error display.
 *
 * @example
 * redactCustomModelSecrets({ auth: { type: 'bearer', secret: 'sk-live' }, headers: { 'X-Token': 'abc' }, ... })
 * // => { auth: { type: 'bearer' }, headers: { 'X-Token': '' }, ... }
 */
export function redactCustomModelSecrets(config: CustomModelConnectionConfig): CustomModelConnectionConfig {
  return {
    ...config,
    auth: {
      type: config.auth.type,
    },
    headers: Object.fromEntries(
      Object.keys(config.headers).map(name => [name, '']),
    ),
  }
}

/**
 * Returns true when a later config would send a different upstream request.
 */
export function haveCustomModelRequestFieldsChanged(previous: unknown, next: CustomModelConnectionConfig): boolean {
  const parsedPrevious = validateCustomModelConnection(previous)
  if (!parsedPrevious.success)
    return true

  return customModelRequestSnapshot(parsedPrevious.output) !== customModelRequestSnapshot(next)
}

/**
 * Resolves validation status after an edit.
 *
 * A previous `configured` status cannot survive a request-field change unless
 * the caller marks the write as a validation result.
 */
export function resolveCustomModelValidationStatus(
  previousConfig: unknown,
  nextConfig: CustomModelConnectionConfig,
  requestedStatus: ProviderValidationStatus,
  options: { validationResult?: boolean } = {},
): ProviderValidationStatus {
  if (options.validationResult)
    return requestedStatus

  if (
    requestedStatus === 'configured'
    && haveCustomModelRequestFieldsChanged(previousConfig, nextConfig)
  ) {
    return 'unconfigured'
  }

  return requestedStatus
}

function protocolHeaders(
  protocol: CustomModelProtocol,
  protocolOptions: CustomModelConnectionConfig['protocolOptions'],
): Record<string, string> {
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'content-type': 'application/json',
  }

  if (protocol === 'anthropic-messages') {
    headers['anthropic-version'] = protocolOptions?.anthropicVersion?.trim() || DEFAULT_ANTHROPIC_VERSION
  }

  return headers
}

function authHeaders(auth: CustomModelAuth): Record<string, string> {
  const secret = auth.secret?.trim()
  if (auth.type === 'bearer' && secret)
    return { authorization: `Bearer ${secret}` }
  if (auth.type === 'x-api-key' && secret)
    return { 'x-api-key': secret }
  return {}
}

function customModelRequestSnapshot(config: CustomModelConnectionConfig): string {
  return JSON.stringify({
    protocol: config.protocol,
    baseUrl: config.baseUrl,
    generationPath: config.generationPath,
    modelListPath: config.modelListPath ?? '',
    authType: config.auth.type,
    authSecret: config.auth.secret ?? '',
    headers: Object.fromEntries(
      Object.entries(config.headers).sort(([left], [right]) => left.localeCompare(right)),
    ),
    models: config.models.map(model => model.id).sort(),
    anthropicVersion: config.protocolOptions?.anthropicVersion ?? '',
  })
}

function normalizeBaseUrl(value: string): string | undefined {
  try {
    const url = new URL(value.trim())
    if (url.protocol !== 'http:' && url.protocol !== 'https:')
      return undefined
    if (url.username || url.password || url.search || url.hash)
      return undefined
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/`
    return url.toString()
  }
  catch {
    return undefined
  }
}

function normalizeOperationPath(value: string): string | undefined {
  const path = value.trim()
  if (!path || path.startsWith('//') || /^[a-z][a-z\d+.-]*:/i.test(path))
    return undefined
  if (path.includes('\\') || path.includes('?') || path.includes('#'))
    return undefined

  const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '')
  if (!normalized)
    return undefined

  try {
    const containsTraversal = normalized
      .split('/')
      .map(segment => decodeURIComponent(segment))
      .some(segment => segment === '.' || segment === '..')
    return containsTraversal ? undefined : normalized
  }
  catch {
    return undefined
  }
}

function isHeaderName(value: string): boolean {
  return /^[!#$%&'*+\-.^\w`|~]+$/.test(value)
}

function issuePath(path: Array<{ key: unknown }> | undefined): string {
  return path?.map(item => String(item.key)).join('.') || 'config'
}
