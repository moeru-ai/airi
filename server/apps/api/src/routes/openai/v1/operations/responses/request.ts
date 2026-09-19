import type { ChatAppSurface } from '../../analytics'

import { createBadRequestError } from '../../../../../utils/error'

const MAX_INPUT_TEXT_LENGTH = 10_485_760
const MAX_TOOL_REFERENCES = 128

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

function enforceStatelessFields(body: Record<string, unknown>) {
  if (body.store !== undefined && body.store !== false)
    invalidRequest('store must be false')
  if (body.background !== undefined && body.background !== false)
    invalidRequest('background must be false')
  if (body.previous_response_id !== undefined && body.previous_response_id !== null)
    invalidRequest('previous_response_id is not available on the stateless gateway')
  if (body.conversation !== undefined && body.conversation !== null)
    invalidRequest('conversation is not available on the stateless gateway')
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

function enforcePortableInput(input: string | unknown[]) {
  if (typeof input === 'string')
    return
  if (input.some(item => isRecord(item) && item.type === 'item_reference'))
    invalidRequest('input must not contain provider item references')
  if (containsProviderFileId(input))
    invalidRequest('input must not contain provider file IDs')
}

function readTools(value: unknown): Array<Record<string, unknown>> | null | undefined {
  if (value == null)
    return value
  if (!Array.isArray(value))
    invalidRequest('tools must be an array or null')

  return value.map((tool, index) => {
    if (!isRecord(tool) || typeof tool.type !== 'string')
      invalidRequest(`tools[${index}] must have a string type`)
    if (tool.type !== 'function' && tool.type !== 'web_search')
      invalidRequest(`tools[${index}].type is not available on the gateway`)
    if (Object.hasOwn(tool, 'file_id') && tool.file_id != null)
      invalidRequest(`tools[${index}] must not contain a provider file ID`)
    return tool
  })
}

function declaredToolNames(tools: Array<Record<string, unknown>> | null | undefined): Set<string> {
  return new Set(tools?.flatMap((tool) => {
    if (tool.type !== 'function' || typeof tool.name !== 'string')
      return []
    return [tool.name]
  }))
}

function enforceToolReference(reference: unknown, names: Set<string>, hasWebSearch: boolean, path: string) {
  if (!isRecord(reference) || typeof reference.type !== 'string')
    invalidRequest(`${path} must have a string type`)
  if (reference.type === 'web_search') {
    if (!hasWebSearch)
      invalidRequest(`${path} must reference a declared tool`)
    return
  }
  if (reference.type !== 'function' || typeof reference.name !== 'string' || !names.has(reference.name))
    invalidRequest(`${path} must reference a declared tool`)
}

function enforceToolChoice(choice: unknown, tools: Array<Record<string, unknown>> | null | undefined) {
  if (choice == null || typeof choice === 'string')
    return
  if (!isRecord(choice))
    invalidRequest('tool_choice must be a string, object, or null')

  const names = declaredToolNames(tools)
  const hasWebSearch = tools?.some(tool => tool.type === 'web_search') === true
  if (choice.type !== 'allowed_tools') {
    enforceToolReference(choice, names, hasWebSearch, 'tool_choice')
    return
  }
  if (!Array.isArray(choice.tools) || choice.tools.length === 0 || choice.tools.length > MAX_TOOL_REFERENCES)
    invalidRequest(`tool_choice.tools must contain between 1 and ${MAX_TOOL_REFERENCES} items`)
  choice.tools.forEach((reference, index) => enforceToolReference(reference, names, hasWebSearch, `tool_choice.tools[${index}]`))
}

function hasWebSearchHistory(input: string | unknown[]): boolean {
  return Array.isArray(input) && input.some(item => isRecord(item) && item.type === 'web_search_call')
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
  enforceStatelessFields(value)
  enforcePortableInput(input)

  const tools = readTools(value.tools)
  enforceToolChoice(value.tool_choice, tools)

  return {
    body: {
      ...value,
      store: false,
    },
    policy: {
      input,
      model,
      stream,
      tools,
      requiresWebSearch: tools?.some(tool => tool.type === 'web_search') === true || hasWebSearchHistory(input),
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
