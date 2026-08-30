import type { FetchTransportPort } from '../../contracts/fetch-transport-port'
import type {
  DiscoveredModel,
  ModelDiscoveryResult,
  ModelRuntimeConnection,
} from '../../contracts/model-runtime-port'

import { nanoid } from 'nanoid'

import { ModelConnectionError, modelConnectionErrorFromStatus, toModelConnectionError } from './errors'

/**
 * Mutable discovery session used by configuration UI.
 *
 * `idle` and `loading` are local UI states. Discovery results never mark a
 * connection as valid or invalid.
 */
export interface ModelDiscoverySession {
  /** Current discovery status and last result payload. */
  readonly state: ModelDiscoverySessionState
  /** Runs discovery and stores the result. */
  run: (discover: () => Promise<ModelDiscoveryResult>) => Promise<ModelDiscoveryResult>
  /** Returns the session to idle. */
  reset: () => void
}

export type ModelDiscoverySessionState
  = | { status: 'idle' }
    | { status: 'loading' }
    | ModelDiscoveryResult

/**
 * Creates a discovery session that starts in `idle`.
 */
export function createModelDiscoverySession(): ModelDiscoverySession {
  let state: ModelDiscoverySessionState = { status: 'idle' }

  return {
    get state() {
      return state
    },
    async run(discover) {
      state = { status: 'loading' }
      try {
        const result = await discover()
        state = result
        return result
      }
      catch (error) {
        const failed: ModelDiscoveryResult = {
          status: 'failed',
          error: toModelConnectionError(error, 'discovery').toJSON(),
        }
        state = failed
        return failed
      }
    },
    reset() {
      state = { status: 'idle' }
    },
  }
}

/**
 * Lists models through the Fetch Transport Port.
 *
 * A missing model-list URL is `unsupported` and sends no request.
 */
export async function discoverModelsWithTransport(
  connection: ModelRuntimeConnection,
  transport: FetchTransportPort,
  options: { abortSignal?: AbortSignal } = {},
): Promise<ModelDiscoveryResult> {
  if (!connection.modelListUrl) {
    return { status: 'unsupported' }
  }

  try {
    const requestId = nanoid()
    const response = await transport.request({
      requestId,
      protocol: connection.protocol,
      operation: 'list-models',
      url: connection.modelListUrl,
      method: 'GET',
      headers: connection.headers,
      signal: options.abortSignal,
    })

    if (response.status === 404 || response.status === 405 || response.status === 501)
      return { status: 'unsupported' }

    if (response.status < 200 || response.status >= 300) {
      const bodyText = await readBodyText(response.body)
      throw modelConnectionErrorFromStatus(
        response.status,
        bodyText || `Remote sent ${response.status} response.`,
        'discovery',
      )
    }

    const bodyText = await readBodyText(response.body)
    const models = parseDiscoveredModels(bodyText)
    if (models.length === 0)
      return { status: 'empty', models: [] }

    return { status: 'success', models }
  }
  catch (error) {
    if (error instanceof ModelConnectionError && error.code === 'not-found')
      return { status: 'unsupported' }

    return {
      status: 'failed',
      error: toModelConnectionError(error, 'discovery').toJSON(),
    }
  }
}

/**
 * Parses OpenAI-style and Anthropic-style model list payloads.
 */
export function parseDiscoveredModels(bodyText: string): DiscoveredModel[] {
  if (!bodyText.trim())
    return []

  let parsed: unknown
  try {
    parsed = JSON.parse(bodyText)
  }
  catch {
    throw new ModelConnectionError({
      stage: 'discovery',
      code: 'unsupported-response',
      message: 'The model list response is not JSON.',
      retryable: false,
    })
  }

  const records = extractModelRecords(parsed)
  if (records == null) {
    throw new ModelConnectionError({
      stage: 'discovery',
      code: 'unsupported-response',
      message: 'The model list response does not include a model array.',
      retryable: false,
    })
  }

  const models: DiscoveredModel[] = []
  const seen = new Set<string>()
  for (const record of records) {
    const model = readDiscoveredModel(record)
    if (!model || seen.has(model.id))
      continue
    seen.add(model.id)
    models.push(model)
  }

  return models
}

function extractModelRecords(parsed: unknown): unknown[] | undefined {
  if (Array.isArray(parsed))
    return parsed
  if (typeof parsed !== 'object' || parsed == null)
    return undefined

  const record = parsed as { data?: unknown, models?: unknown }
  if (Array.isArray(record.data))
    return record.data
  if (Array.isArray(record.models))
    return record.models
  return undefined
}

function readDiscoveredModel(value: unknown): DiscoveredModel | undefined {
  if (typeof value === 'string' && value.trim())
    return { id: value.trim() }
  if (typeof value !== 'object' || value == null)
    return undefined

  const record = value as { id?: unknown, name?: unknown, display_name?: unknown }
  if (typeof record.id !== 'string' || !record.id.trim())
    return undefined

  const name = typeof record.name === 'string'
    ? record.name.trim()
    : typeof record.display_name === 'string'
      ? record.display_name.trim()
      : undefined

  return {
    id: record.id.trim(),
    ...(name ? { name } : {}),
  }
}

async function readBodyText(body: ReadableStream<Uint8Array> | null): Promise<string> {
  if (!body)
    return ''
  return await new Response(body).text()
}
