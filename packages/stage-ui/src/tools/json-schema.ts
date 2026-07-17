import type { JsonSchema } from 'xsschema'

// Scalar JSON Schema types that may safely collapse into a `type: [..., 'null']`
// union. Object/array types are intentionally excluded: collapsing them would
// drop their nested `required`/`items`/`additionalProperties` constraints.
const JSON_SCHEMA_NULLABLE_SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

function isJsonSchema(value: JsonSchema | boolean | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

/**
 * Normalizes nullable scalar unions in a generated JSON Schema so strict
 * OpenAI-compatible providers accept the tool schema.
 *
 * `xsschema` (and zod v4) emit a nullable scalar like `integer | null` as an
 * `anyOf`, but some validators (e.g. Azure) reject that form while accepting
 * `type: ['integer', 'null']`. This recurses through the schema and collapses
 * only scalar-or-null `anyOf`s; object/array unions are left untouched so their
 * nested `required`/`items` constraints survive provider validation.
 *
 * Before:
 * - `{ anyOf: [{ type: 'integer', minimum: 1 }, { type: 'null' }] }`
 *
 * After:
 * - `{ type: ['integer', 'null'] }`
 *
 * NOTICE: the collapse drops sibling keywords carried on the scalar branch
 * (`minimum`/`maximum`/`enum`), so callers that relied on those bounds must
 * re-validate at runtime.
 */
export function normalizeNullableAnyOf(schema: JsonSchema): JsonSchema {
  const next: JsonSchema = { ...schema }

  if (next.properties) {
    const properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => {
        if (!isJsonSchema(value))
          return [key, value]
        return [key, normalizeNullableAnyOf(value)]
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
    next.items = next.items.map(item => isJsonSchema(item) ? normalizeNullableAnyOf(item) : item)
  }
  else if (isJsonSchema(next.items)) {
    next.items = normalizeNullableAnyOf(next.items)
  }

  if (next.anyOf) {
    next.anyOf = next.anyOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)

    const normalizedEntries = next.anyOf.filter(isJsonSchema)
    const primitiveTypes = normalizedEntries
      .map(entry => entry.type)
      .filter((type): type is Exclude<JsonSchema['type'], JsonSchema['type'][]> => typeof type === 'string')
    const dedupedPrimitiveTypes = [...new Set(primitiveTypes)]

    if (
      primitiveTypes.length === normalizedEntries.length
      && dedupedPrimitiveTypes.length > 0
      && dedupedPrimitiveTypes.every(type => type !== undefined && JSON_SCHEMA_NULLABLE_SCALAR_TYPES.has(type))
    ) {
      delete next.anyOf
      next.type = dedupedPrimitiveTypes as JsonSchema['type']
    }
  }

  if (next.oneOf) {
    next.oneOf = next.oneOf.map(value => isJsonSchema(value) ? normalizeNullableAnyOf(value) : value)
  }

  return next
}
