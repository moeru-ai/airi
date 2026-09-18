import * as v from 'valibot'

import * as base from './openresponses-schema'

// OpenAI extensions to the generated OpenResponses request contract.
// References: https://platform.openai.com/docs/api-reference/responses/create
// https://github.com/openai/openai-python/tree/main/src/openai/types/responses
const file = v.pipe(v.strictObject({ ...base.vInputFileContentParam.entries, file_id: v.optional(v.string()) }), v.check(part => Boolean(part.file_id || part.file_data || part.file_url), 'A file needs an ID, inline data or a URL'))
const image = v.pipe(v.strictObject({ ...base.vInputImageContentParamAutoParam.entries, file_id: v.optional(v.string()), detail: v.optional(v.picklist(['auto', 'low', 'high', 'original'])) }), v.check(part => Boolean(part.file_id || part.image_url), 'An image needs an ID or URL'))
const inputPart = v.union([base.vInputTextContentParam, image, file, v.strictObject(base.vInputVideoContent.entries)])
const outputPart = v.union([
  v.looseObject({ ...base.vOutputTextContentParam.entries, annotations: v.optional(v.array(v.unknown())) }),
  base.vRefusalContentParam,
])
const jsonSchemaObject = v.pipe(
  v.unknown(),
  v.check(value => !Array.isArray(value), 'A JSON Schema object cannot be an array'),
  v.looseObject({}),
)
const jsonSchemaNode = v.union([v.boolean(), jsonSchemaObject])
const functionParametersSchema = v.pipe(
  v.looseObject({
    type: v.literal('object'),
    properties: v.pipe(jsonSchemaObject, v.check(value => Object.values(value).every(node => v.safeParse(jsonSchemaNode, node).success), 'JSON Schema properties must contain object or boolean schemas')),
    required: v.array(v.string()),
  }),
  v.check(schema => new Set(schema.required).size === schema.required.length, 'JSON Schema required fields must be unique'),
  v.check(schema => schema.required.every(name => Object.hasOwn(schema.properties, name)), 'JSON Schema required fields must exist in properties'),
)
const functionToolSchema = v.strictObject({
  ...base.vFunctionToolParam.entries,
  parameters: functionParametersSchema,
  strict: v.optional(v.nullable(v.boolean())),
})
const jsonSchemaResponseFormat = v.strictObject({
  ...base.vJsonSchemaResponseFormatParam.entries,
  type: v.literal('json_schema'),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(64), v.regex(/^[\w-]+$/)),
  schema: v.pipe(jsonSchemaObject, v.check(value => value.type === 'object', 'A structured output JSON Schema must have an object root')),
})
const text = v.strictObject({
  ...base.vTextParam.entries,
  format: v.optional(v.nullable(v.union([base.vTextResponseFormat, jsonSchemaResponseFormat]))),
})
const reasoning = v.object({
  ...base.vReasoningParam.entries,
  effort: v.nullish(v.union([base.vReasoningEffortEnum, v.literal('minimal')])),
})
const message = v.strictObject({
  ...base.vUserMessageItemParam.entries,
  role: v.picklist(['user', 'system', 'developer', 'assistant']),
  content: v.union([v.string(), v.array(v.union([inputPart, outputPart]))]),
  phase: v.optional(v.nullable(base.vAssistantMessageItemParam.entries.phase.wrapped)),
})

/** Provider-hosted web search. No local executor or gateway policy is attached. */
export const webSearchToolSchema = v.strictObject({
  type: v.literal('web_search'),
  external_web_access: v.optional(v.boolean()),
  search_context_size: v.optional(v.picklist(['low', 'medium', 'high'])),
  filters: v.optional(v.nullable(v.strictObject({ allowed_domains: v.optional(v.nullable(v.array(v.string()))) }))),
  user_location: v.optional(v.nullable(v.strictObject({ type: v.optional(v.literal('approximate')), city: v.optional(v.nullable(v.string())), country: v.optional(v.nullable(v.string())), region: v.optional(v.nullable(v.string())), timezone: v.optional(v.nullable(v.string())) }))),
})
/** Search output can be replayed with the rest of a response's input Items. */
export const webSearchCallSchema = v.strictObject({
  type: v.literal('web_search_call'),
  id: v.string(),
  status: v.picklist(['in_progress', 'searching', 'completed', 'failed', 'incomplete']),
  action: v.union([
    v.strictObject({ type: v.literal('search'), query: v.optional(v.string()), queries: v.optional(v.array(v.string())), sources: v.optional(v.array(v.strictObject({ type: v.literal('url'), url: v.string() }))) }),
    v.strictObject({ type: v.literal('open_page'), url: v.optional(v.nullable(v.string())) }),
    v.strictObject({ type: v.literal('find_in_page'), url: v.string(), pattern: v.string() }),
  ]),
})
/** Native wire Items; reference-based state is valid here and restricted by gateway policy separately. */
export const responseItemSchema = v.union([
  message,
  v.strictObject({ ...base.vItemReferenceParam.entries, type: v.literal('item_reference') }),
  base.vCompactionSummaryItemParam,
  v.strictObject({ ...base.vReasoningItemParam.entries, content: v.optional(v.array(v.strictObject({ type: v.literal('reasoning_text'), text: v.string() }))), status: v.optional(base.vFunctionCallStatus) }),
  base.vFunctionCallItemParam,
  v.strictObject({ ...base.vFunctionCallOutputItemParam.entries, output: v.union([v.string(), v.pipe(v.array(inputPart), v.minLength(1))]) }),
  webSearchCallSchema,
])
const toolReference = v.union([v.strictObject(base.vSpecificFunctionParam.entries), v.strictObject({ type: v.literal('web_search') })])
/** JSON wire request, independent of the streaming-only camelCase SDK options. */
export const createResponseSchema = v.strictObject({
  ...base.vCreateResponseBody.entries,
  input: v.union([v.string(), v.array(responseItemSchema)]),
  conversation: v.optional(v.nullable(v.union([v.string(), v.strictObject({ id: v.string() })]))),
  tools: v.optional(v.array(v.union([webSearchToolSchema, functionToolSchema]))),
  tool_choice: v.optional(v.union([base.vToolChoiceValueEnum, toolReference, v.strictObject({ ...base.vAllowedToolsParam.entries, mode: v.picklist(['auto', 'required']), tools: v.pipe(v.array(toolReference), v.minLength(1)) })])),
  include: v.optional(v.array(v.union([base.vIncludeEnum, v.literal('web_search_call.action.sources')]))),
  max_output_tokens: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  reasoning: v.nullish(reasoning),
  temperature: v.nullish(v.pipe(v.number(), v.minValue(0), v.maxValue(2))),
  text: v.optional(v.nullable(text)),
  top_p: v.nullish(v.pipe(v.number(), v.minValue(0), v.maxValue(1))),
})
