import { clamp } from 'es-toolkit'
import { fallback, integer, object, optional, pipe, string, transform } from 'valibot'

interface QueryIntegerSchemaOptions {
  defaultValue: number
  minimum?: number
  maximum?: number
}

/**
 * Parse a query-string integer with an explicit default and optional bounds.
 * Invalid, missing, or empty inputs fall back to the declared default.
 */
export function createQueryIntegerSchema(options: QueryIntegerSchemaOptions) {
  return fallback(
    pipe(
      optional(string(), String(options.defaultValue)),
      transform(input => input.trim()),
      transform(input => Number.parseInt(input, 10)),
      integer(),
      transform(value => clamp(value, options.minimum ?? Number.NEGATIVE_INFINITY, options.maximum ?? Number.POSITIVE_INFINITY)),
    ),
    options.defaultValue,
  )
}

export const LimitOffsetPaginationQuerySchema = object({
  limit: createQueryIntegerSchema({
    defaultValue: 20,
    minimum: 1,
    maximum: 100,
  }),
  offset: createQueryIntegerSchema({
    defaultValue: 0,
    minimum: 0,
  }),
})
