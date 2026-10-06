import * as v from 'valibot'

/**
 * The collections that the server stores. The server does not read document
 * content, so this list is the only limit on what a client can store.
 *
 * Add a collection only for small documents that one user owns and edits. Do
 * not add data that the server must read, bill, or show to other users.
 */
export const CollectionSchema = v.picklist(['character-cards'])

export const DocumentIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(64))

const FieldKeySchema = v.pipe(v.string(), v.minLength(1), v.maxLength(256))
const RevisionSchema = v.pipe(v.number(), v.integer(), v.minValue(0))

/**
 * The server stores a field value as opaque JSON. A missing row represents an
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

export const PushDocumentRequestSchema = v.object({
  fields: v.pipe(v.array(v.union([SetFieldSchema, RemoveFieldSchema])), v.minLength(1), v.maxLength(256)),
})

export const DeleteDocumentQuerySchema = v.object({
  /** The document revision that the client last received. A newer server revision rejects the deletion. */
  revision: v.pipe(v.string(), v.regex(/^\d+$/), v.transform(Number), RevisionSchema),
})

export type Collection = v.InferOutput<typeof CollectionSchema>
export type PushedField = v.InferOutput<typeof PushDocumentRequestSchema>['fields'][number]
