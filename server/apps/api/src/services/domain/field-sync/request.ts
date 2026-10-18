import type { BaseIssue, BaseSchema } from 'valibot'

import { createBadRequestError } from '@proj-airi/http-error-shared'

import * as v from 'valibot'

const FieldKeySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const RevisionSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

/**
 * The store keeps a field value as opaque JSON. A missing row represents an
 * absent field, so `null` is not a valid value.
 */
const FieldValueSchema = v.pipe(
  v.unknown(),
  v.check(value => value !== null && value !== undefined, 'A field value must not be null.'),
)

const SetFieldSchema = v.object({
  key: FieldKeySchema,
  /** The field revision that the client last received. Zero means that the client never received the field. */
  baseRevision: RevisionSchema,
  value: FieldValueSchema,
})

const RemoveFieldSchema = v.object({
  key: FieldKeySchema,
  baseRevision: RevisionSchema,
  removed: v.literal(true),
})

const PushRequestSchema = v.object({
  fields: v.pipe(v.array(v.union([SetFieldSchema, RemoveFieldSchema])), v.minLength(1), v.maxLength(256)),
})

const DocumentIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64))

const DeleteQuerySchema = v.object({
  /** The document revision that the client last received. A newer revision on the server rejects the deletion. */
  revision: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), RevisionSchema),
})

const DEFAULT_HISTORY_LIMIT = 50
const MAX_HISTORY_LIMIT = 200

const OptionalRevisionQuerySchema = v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), RevisionSchema))
const OptionalLimitQuerySchema = v.optional(v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), v.integer(), v.minValue(1), v.maxValue(MAX_HISTORY_LIMIT)))

const HistoryQuerySchema = v.object({
  /** Lists revisions older than this one. Omit it to start from the newest revision. */
  before: OptionalRevisionQuerySchema,
  /** The most history entries to return in one call. */
  limit: OptionalLimitQuerySchema,
})

const RevisionParamSchema = v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), RevisionSchema)

export type PushedField = v.InferOutput<typeof PushRequestSchema>['fields'][number]

function parseRequest<TOutput>(schema: BaseSchema<unknown, TOutput, BaseIssue<unknown>>, input: unknown) {
  const result = v.safeParse(schema, input)
  if (!result.success)
    throw createBadRequestError('Invalid Request', 'INVALID_REQUEST', result.issues)
  return result.output
}

/**
 * Reads the JSON body of a request. Throws a 400 error when the body is not valid JSON.
 * Without it, a malformed body reaches the global error handler and becomes a 500 response.
 */
export async function readJsonBody(request: { json: () => Promise<unknown> }) {
  try {
    return await request.json()
  }
  catch {
    throw createBadRequestError('The request body must be valid JSON', 'INVALID_REQUEST')
  }
}

/** Parses the `:id` parameter of a document route. Throws a 400 error for an invalid id. */
export function parseDocumentId(param: string) {
  return parseRequest(DocumentIdSchema, param)
}

/** Parses the body of a push request into the fields that the store accepts. Throws a 400 error for an invalid body. */
export function parsePushRequest(body: unknown) {
  return parseRequest(PushRequestSchema, body).fields
}

/** Parses the query of a delete request into the document revision. Throws a 400 error for an invalid query. */
export function parseDeleteRevision(query: Record<string, string>) {
  return parseRequest(DeleteQuerySchema, query).revision
}

/** Parses the query of a history request into its pagination. Throws a 400 error for an invalid query. */
export function parseHistoryQuery(query: Record<string, string | undefined>) {
  const parsed = parseRequest(HistoryQuerySchema, query)
  return { before: parsed.before, limit: parsed.limit ?? DEFAULT_HISTORY_LIMIT }
}

/** Parses the `:revision` parameter of a snapshot route. Throws a 400 error for an invalid revision. */
export function parseRevisionParam(param: string) {
  return parseRequest(RevisionParamSchema, param)
}
