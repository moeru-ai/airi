import type { InferOutput } from 'valibot'

import type { ChatAppSurface } from '../../analytics'

import { array, boolean, check, integer, literal, looseObject, minLength, minValue, nonEmpty, null_, nullable, number, object, optional, picklist, pipe, safeParse, strictObject, string, union, unknown } from 'valibot'

import { createBadRequestError } from '../../../../../utils/error'

const textPart = object({ type: literal('input_text'), text: string() })
const imagePart = strictObject({ type: literal('input_image'), image_url: string(), detail: optional(picklist(['auto', 'low', 'high', 'original'])) })
const filePart = pipe(strictObject({ type: literal('input_file'), file_data: optional(string()), filename: optional(string()), file_url: optional(string()) }), check(part => Boolean(part.file_data || part.file_url), 'A file needs inline data or a URL'))
const outputPart = union([
  looseObject({ type: literal('output_text'), text: string(), annotations: optional(array(unknown())) }),
  strictObject({ type: literal('refusal'), refusal: string() }),
])
const content = union([string(), array(union([textPart, imagePart, filePart, outputPart]))])
const searchAction = union([
  strictObject({ type: literal('search'), query: optional(string()), queries: optional(array(string())), sources: optional(array(strictObject({ type: literal('url'), url: string() }))) }),
  strictObject({ type: literal('open_page'), url: optional(nullable(string())) }),
  strictObject({ type: literal('find_in_page'), url: string(), pattern: string() }),
])
const toolReference = union([
  strictObject({ type: literal('function'), name: pipe(string(), nonEmpty()) }),
  strictObject({ type: literal('web_search') }),
])
const webSearchTool = strictObject({
  type: literal('web_search'),
  external_web_access: optional(boolean()),
  search_context_size: optional(picklist(['low', 'medium', 'high'])),
  filters: optional(nullable(strictObject({ allowed_domains: optional(nullable(array(string()))) }))),
  user_location: optional(nullable(strictObject({ type: optional(literal('approximate')), city: optional(nullable(string())), country: optional(nullable(string())), region: optional(nullable(string())), timezone: optional(nullable(string())) }))),
})
const item = union([
  strictObject({ type: literal('web_search_call'), id: string(), status: picklist(['in_progress', 'searching', 'completed', 'failed', 'incomplete']), action: searchAction }),
  strictObject({ type: optional(literal('message'), 'message'), id: optional(string()), role: picklist(['user', 'system', 'developer', 'assistant']), content, status: optional(picklist(['in_progress', 'completed', 'incomplete'])), phase: optional(nullable(picklist(['commentary', 'final_answer']))) }),
  strictObject({ type: literal('compaction'), id: optional(string()), encrypted_content: string() }),
  strictObject({ type: literal('reasoning'), id: optional(string()), summary: array(strictObject({ type: literal('summary_text'), text: string() })), content: optional(array(strictObject({ type: literal('reasoning_text'), text: string() }))), encrypted_content: optional(nullable(string())), status: optional(picklist(['in_progress', 'completed', 'incomplete'])) }),
  strictObject({ type: literal('function_call'), id: optional(string()), status: optional(picklist(['in_progress', 'completed', 'incomplete'])), call_id: string(), name: string(), arguments: string() }),
  strictObject({ type: literal('function_call_output'), id: optional(string()), status: optional(picklist(['in_progress', 'completed', 'incomplete'])), call_id: string(), output: union([string(), pipe(array(union([textPart, imagePart, filePart])), minLength(1))]) }),
])
const requestSchema = strictObject({
  model: optional(pipe(string(), nonEmpty()), 'auto'),
  input: union([string(), array(item)]),
  stream: optional(boolean(), false),
  // Gateway credentials belong to a shared upstream account. Complete Items
  // are replayed by the client; opaque provider-side state is never accepted.
  store: optional(literal(false), false),
  background: optional(literal(false)),
  previous_response_id: optional(null_()),
  conversation: optional(null_()),
  instructions: optional(string()),
  tools: optional(array(union([webSearchTool, strictObject({ type: literal('function'), name: pipe(string(), nonEmpty()), parameters: nullable(looseObject({})), strict: optional(nullable(boolean())), description: optional(nullable(string())) })]))),
  tool_choice: optional(union([picklist(['auto', 'none', 'required']), toolReference, strictObject({ type: literal('allowed_tools'), mode: picklist(['auto', 'required']), tools: pipe(array(toolReference), minLength(1)) })])),
  reasoning: optional(looseObject({ effort: optional(string()), summary: optional(string()) })),
  text: optional(looseObject({})),
  include: optional(array(picklist(['reasoning.encrypted_content', 'message.output_text.logprobs', 'web_search_call.action.sources']))),
  max_output_tokens: optional(pipe(number(), integer(), minValue(1))),
  temperature: optional(number()),
  top_p: optional(number()),
  parallel_tool_calls: optional(boolean()),
  truncation: optional(picklist(['auto', 'disabled'])),
})

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
