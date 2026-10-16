import type { GenericSchema, InferOutput } from 'valibot'

import type { ChatToolCallWidgetReading } from './tool-call-renderer'

import { safeParse } from 'valibot'

/** The parts of a valibot schema that name the fields of a value. Pipe items that are actions have none of them. */
interface SchemaShape {
  kind: string
  entries?: Record<string, SchemaShape>
  item?: SchemaShape
  wrapped?: SchemaShape
  pipe?: readonly SchemaShape[]
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** A field without a value holds no data, so it does not show as other data. */
function isEmpty(value: unknown) {
  return value === undefined || value === null || value === ''
    || (Array.isArray(value) && value.length === 0)
    || (isRecord(value) && Object.keys(value).length === 0)
}

function collectUncovered(schema: SchemaShape, value: unknown): unknown {
  // A piped schema checks the value with the last schema in its pipe, for example the object after `parseJson()`.
  if (schema.pipe)
    return collectUncovered(schema.pipe.findLast(item => item.kind === 'schema') ?? { kind: 'schema' }, value)
  if (schema.wrapped)
    return collectUncovered(schema.wrapped, value)

  if (schema.item && Array.isArray(value)) {
    const items = value.map(item => collectUncovered(schema.item!, item))
    // An item without uncovered fields stays as an empty object, so every other item keeps its number.
    return items.some(item => item !== undefined) ? items.map(item => item ?? {}) : undefined
  }

  if (schema.entries && isRecord(value)) {
    const rest: Record<string, unknown> = {}
    for (const [key, field] of Object.entries(value)) {
      const entry = schema.entries[key]
      const uncovered = entry ? collectUncovered(entry, field) : field
      if (!isEmpty(uncovered))
        rest[key] = uncovered
    }
    return Object.keys(rest).length > 0 ? rest : undefined
  }

  return undefined
}

/**
 * Collects the fields of a value that a schema does not name, at any depth.
 * A field without a value, such as `null` or an empty list, is left out.
 *
 * The schema must keep unknown fields in its output, so its objects are `looseObject`.
 *
 * @example
 * uncoveredFields(looseObject({ city: string() }), { city: 'Bangkok', timezone: 'Asia/Bangkok' })
 * // => { timezone: 'Asia/Bangkok' }
 */
export function uncoveredFields(schema: GenericSchema, value: unknown): unknown {
  return collectUncovered(schema, value)
}

/**
 * Reads a tool result with the schema of a widget.
 *
 * Returns `undefined` when the result does not match, so the row shows the generic arguments and result.
 * Otherwise returns the props, and every field that the schema does not name as `rest`.
 */
export function readToolResult<TSchema extends GenericSchema>(
  schema: TSchema,
  result: unknown,
  toProps: (output: InferOutput<TSchema>) => Record<string, unknown> | undefined,
): ChatToolCallWidgetReading | undefined {
  const parsed = safeParse(schema, result)
  if (!parsed.success)
    return undefined
  const props = toProps(parsed.output)
  return props && { props, rest: uncoveredFields(schema, parsed.output) }
}
