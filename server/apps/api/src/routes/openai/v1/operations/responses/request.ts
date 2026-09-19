import type { ChatAppSurface } from '../../analytics'

import { createBadRequestError } from '../../../../../utils/error'

const MAX_INPUT_TEXT_LENGTH = 10_485_760

interface ResponsesRequestPolicy {
  input: string | unknown[]
  model: string
  stream: boolean
  tools?: Array<Record<string, unknown>> | null
  requiresWebSearch: boolean
}

interface ParsedResponsesRequest {
  body: Record<string, unknown>
  policy: ResponsesRequestPolicy
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function invalidRequest(issue: string): never {
  throw createBadRequestError('Invalid stateless Responses request', 'INVALID_RESPONSES_REQUEST', { issues: [issue] })
}

function readInput(body: Record<string, unknown>): string | unknown[] {
  const input = body.input
  if (typeof input === 'string') {
    if (input.length > MAX_INPUT_TEXT_LENGTH)
      invalidRequest(`input must contain at most ${MAX_INPUT_TEXT_LENGTH} characters`)
    return input
  }
  if (!Array.isArray(input))
    invalidRequest('input must be a string or an array')
  return input
}

function readModel(value: unknown): string {
  if (value === undefined)
    return 'auto'
  if (typeof value !== 'string' || value.length === 0)
    invalidRequest('model must be a non-empty string')
  return value
}

function readStream(value: unknown): boolean {
  if (value === undefined)
    return false
  if (typeof value !== 'boolean')
    invalidRequest('stream must be a boolean')
  return value
}

function containsProviderFileId(value: unknown): boolean {
  const pending: unknown[] = [value]
  const seen = new WeakSet<object>()

  while (pending.length > 0) {
    const current = pending.pop()
    if (typeof current !== 'object' || current === null || seen.has(current))
      continue
    seen.add(current)

    if (Array.isArray(current)) {
      pending.push(...current)
      continue
    }
    if (!isRecord(current))
      continue

    if (Object.hasOwn(current, 'file_id') && current.file_id != null)
      return true
    pending.push(...Object.values(current))
  }

  return false
}

/** Enforces rules owned by the shared gateway account. The provider owns all other request validation. */
function enforceResponsesSecurity(body: Record<string, unknown>, input: string | unknown[]): Pick<ResponsesRequestPolicy, 'tools' | 'requiresWebSearch'> {
  if (body.store !== undefined && body.store !== false)
    invalidRequest('store must be false')
  if (body.background !== undefined && body.background !== false)
    invalidRequest('background must be false')
  if (body.previous_response_id !== undefined && body.previous_response_id !== null)
    invalidRequest('previous_response_id is not available on the stateless gateway')
  if (body.conversation !== undefined && body.conversation !== null)
    invalidRequest('conversation is not available on the stateless gateway')

  if (Array.isArray(input)) {
    if (input.some(item => isRecord(item) && item.type === 'item_reference'))
      invalidRequest('input must not contain provider item references')
    if (containsProviderFileId(input))
      invalidRequest('input must not contain provider file IDs')
  }

  const toolsValue = body.tools
  if (toolsValue != null && !Array.isArray(toolsValue))
    invalidRequest('tools must be an array or null')
  const tools = toolsValue?.map((tool, index) => {
    if (!isRecord(tool) || typeof tool.type !== 'string')
      invalidRequest(`tools[${index}] must have a string type`)
    if (tool.type !== 'function' && tool.type !== 'web_search')
      invalidRequest(`tools[${index}].type is not available on the gateway`)
    if (Object.hasOwn(tool, 'file_id') && tool.file_id != null)
      invalidRequest(`tools[${index}] must not contain a provider file ID`)
    return tool
  })

  const hasWebSearchHistory = Array.isArray(input) && input.some(item => isRecord(item) && item.type === 'web_search_call')
  return {
    tools,
    requiresWebSearch: tools?.some(tool => tool.type === 'web_search') === true || hasWebSearchHistory,
  }
}

/**
 * Reads gateway policy fields without rebuilding the provider request.
 * Unknown protocol fields stay in the returned wire body.
 */
export function parseResponsesRequest(value: unknown): ParsedResponsesRequest {
  if (!isRecord(value))
    invalidRequest('request body must be a JSON object')

  const input = readInput(value)
  const model = readModel(value.model)
  const stream = readStream(value.stream)
  const security = enforceResponsesSecurity(value, input)

  return {
    body: {
      ...value,
      store: false,
    },
    policy: {
      input,
      model,
      stream,
      ...security,
    },
  }
}

/** Input for one stateless Responses gateway operation. */
export interface ResponsesOperationRequest {
  userId: string
  body: Record<string, unknown>
  policy: ResponsesRequestPolicy
  sessionId?: string
  roundId?: string
  appSurface?: ChatAppSurface
  abortSignal?: AbortSignal
}
