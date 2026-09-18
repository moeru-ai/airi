import type { InferOutput } from 'valibot'

import type { responseItemSchema } from '../../../../../services/adapters/llm/schemas/responses'
import type { ChatAppSurface } from '../../analytics'

import { check, literal, nonEmpty, null_, optional, pick, pipe, safeParse, strictObject, string } from 'valibot'

import { createResponseSchema } from '../../../../../services/adapters/llm/schemas/responses'
import { createBadRequestError } from '../../../../../utils/error'

// Keep the gateway's supported fields explicit. The protocol layer owns their wire shapes.
const supported = pick(createResponseSchema, [
  'model',
  'input',
  'stream',
  'store',
  'background',
  'previous_response_id',
  'conversation',
  'instructions',
  'tools',
  'tool_choice',
  'reasoning',
  'text',
  'include',
  'max_output_tokens',
  'temperature',
  'top_p',
  'parallel_tool_calls',
  'truncation',
])
const requestSchema = pipe(strictObject({
  ...supported.entries,
  input: createResponseSchema.entries.input,
  model: optional(pipe(string(), nonEmpty()), 'auto'),
  stream: optional(createResponseSchema.entries.stream.wrapped, false),
  store: optional(literal(false), false),
  background: optional(literal(false)),
  previous_response_id: optional(null_()),
  conversation: optional(null_()),
}), check(body => typeof body.input === 'string' || body.input.every(isPortableItem), 'Provider-side item and file references are not allowed'))

function isPortableItem(item: InferOutput<typeof responseItemSchema>): boolean {
  // Gateway keys belong to a shared account. Input must carry its own content.
  if (item.type === 'item_reference')
    return false
  if (item.type === 'message' && Array.isArray(item.content))
    return item.content.every(part => !('file_id' in part) || part.file_id == null)
  if (item.type === 'function_call_output' && Array.isArray(item.output))
    return item.output.every(part => !('file_id' in part) || part.file_id == null)
  return true
}

/** Validated input for one stateless Responses create request. */
export interface ResponsesOperationRequest {
  userId: string
  body: InferOutput<typeof requestSchema>
  sessionId?: string
  roundId?: string
  appSurface?: ChatAppSurface
  abortSignal?: AbortSignal
}

/** Validates supported create fields before forwarding shared gateway credentials. */
export function parseResponsesRequest(value: unknown): InferOutput<typeof requestSchema> {
  const parsed = safeParse(requestSchema, value)
  if (!parsed.success)
    throw createBadRequestError('Invalid stateless Responses request', 'INVALID_RESPONSES_REQUEST', { issues: parsed.issues.map(issue => issue.message) })
  return parsed.output
}
