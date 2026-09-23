import type { JsonSchema } from 'xsschema'

type JsonSchemaPrimitiveType = 'string' | 'number' | 'integer' | 'boolean' | 'null'

const JSON_SCHEMA_PRIMITIVE_TYPES: ReadonlySet<string> = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function isJsonSchema(value: JsonSchema | boolean | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

function isJsonSchemaPrimitiveType(value: unknown): value is JsonSchemaPrimitiveType {
  return typeof value === 'string' && JSON_SCHEMA_PRIMITIVE_TYPES.has(value)
}

/**
 * Collapses primitive `anyOf` branches into one JSON Schema type array.
 *
 * Use this function in a provider adapter only after that provider rejects the
 * canonical `anyOf` form.
 *
 * @example
 * collapseToolSchemaPrimitiveAnyOf({
 *   anyOf: [{ type: 'string' }, { type: 'null' }],
 * })
 * // => { type: ['string', 'null'] }
 */
export function collapseToolSchemaPrimitiveAnyOf(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }

  if (next.properties) {
    const properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => {
        if (!isJsonSchema(value))
          return [key, value]
        return [key, collapseToolSchemaPrimitiveAnyOf(value)]
      }),
    )
    next.properties = properties

    if (Array.isArray(next.required)) {
      const propertyNames = new Set(Object.keys(properties))
      next.required = next.required.filter(key => propertyNames.has(key))

      if (next.required.length === 0)
        delete next.required
    }
  }

  if (Array.isArray(next.items)) {
    next.items = next.items.map(item => isJsonSchema(item) ? collapseToolSchemaPrimitiveAnyOf(item) : item)
  }
  else if (isJsonSchema(next.items)) {
    next.items = collapseToolSchemaPrimitiveAnyOf(next.items)
  }

  if (next.anyOf) {
    next.anyOf = next.anyOf.map(value => isJsonSchema(value) ? collapseToolSchemaPrimitiveAnyOf(value) : value)

    const normalizedEntries = next.anyOf.filter(isJsonSchema)
    const primitiveTypes = normalizedEntries
      .map(entry => entry.type)
      .filter(isJsonSchemaPrimitiveType)
    const dedupedPrimitiveTypes = [...new Set(primitiveTypes)]

    if (
      primitiveTypes.length === normalizedEntries.length
      && dedupedPrimitiveTypes.length > 0
    ) {
      for (const entry of normalizedEntries) {
        if (entry.type !== 'number' && entry.type !== 'integer')
          continue

        next.multipleOf ??= entry.multipleOf
        next.minimum ??= entry.minimum
        next.maximum ??= entry.maximum
        next.exclusiveMinimum ??= entry.exclusiveMinimum
        next.exclusiveMaximum ??= entry.exclusiveMaximum
      }

      delete next.anyOf
      next.type = dedupedPrimitiveTypes
    }
  }

  if (next.oneOf) {
    next.oneOf = next.oneOf.map(value => isJsonSchema(value) ? collapseToolSchemaPrimitiveAnyOf(value) : value)
  }

  return next
}
