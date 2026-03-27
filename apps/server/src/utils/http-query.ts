import { fallback, integer, object, optional, pipe, string, transform } from 'valibot'

interface QueryIntegerSchemaOptions {
  defaultValue: number
  minimum?: number
  maximum?: number
}

function clampQueryInteger(value: number, minimum?: number, maximum?: number): number {
  if (minimum != null && value < minimum)
    return minimum

  if (maximum != null && value > maximum)
    return maximum

  return value
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
      transform(value => clampQueryInteger(value, options.minimum, options.maximum)),
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
