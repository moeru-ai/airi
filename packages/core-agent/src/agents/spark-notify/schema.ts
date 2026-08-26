import type { JsonSchema } from 'xsschema'

import { z } from 'zod'

const JSON_SCHEMA_NULLABLE_SCALAR_TYPES = new Set(['boolean', 'integer', 'null', 'number', 'string'])

/**
 * Normalizes nullable scalar unions in generated JSON schema.
 *
 * Before:
 * - `{ anyOf: [{ type: 'string' }, { type: 'null' }] }`
 *
 * After:
 * - `{ type: ['string', 'null'] }`
 */
export function normalizeNullableAnyOf(schema: JsonSchema): JsonSchema {
  // NOTICE: `xsschema` emits nullable unions using `anyOf`, but some OpenAI-compatible
  // validators reject that shape while accepting `type: ['string', 'null']`.
  const next: JsonSchema = { ...schema }

  if (next.properties) {
    next.properties = Object.fromEntries(
      Object.entries(next.properties).map(([key, value]) => {
        if (!isJsonSchema(value))
          return [key, value]
        return [key, normalizeNullableAnyOf(value)]
      }),
    )
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
      && dedupedPrimitiveTypes.every(type => JSON_SCHEMA_NULLABLE_SCALAR_TYPES.has(String(type)))
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

function isJsonSchema(value: boolean | JsonSchema | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

export const sparkCommandGuidanceOptionSchema = z.object({
  fallback: z.union([z.array(z.string()), z.null()]).describe('Fallback steps if the main plan fails.'),
  label: z.string().describe('Short label for the option.'),
  possibleOutcome: z.union([z.array(z.string()), z.null()]).describe('Expected outcomes if this option is followed.'),
  rationale: z.union([z.string(), z.null()]).describe('Why this option makes sense.'),
  risk: z.union([z.enum(['high', 'medium', 'low', 'none']), z.null()]).describe('Risk level of this option.'),
  steps: z.array(z.string()).min(1).describe('Step-by-step actions the target should follow.'),
  triggers: z.union([z.array(z.string()), z.null()]).describe('Conditions that should trigger this option.'),
}).strict()

export const sparkCommandPersonaSchema = z.object({
  strength: z.enum(['very-high', 'high', 'medium', 'low', 'very-low']),
  traits: z.string().describe('Trait name to adjust behavior. For example, "bravery", "cautiousness", "friendliness".'),
}).strict()

export const sparkNotifyCommandGuidanceSchema = z.object({
  options: z.array(sparkCommandGuidanceOptionSchema),
  persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe('Optional persona controls for the receiver.'),
  type: z.enum(['proposal', 'instruction', 'memory-recall']),
}).strict()

export const sparkNotifyCommandItemSchema = z.object({
  ack: z.string().describe('Acknowledgment content used to be passed to sub-agents upon command receipt.'),
  destinations: z.array(z.string()).min(1).describe('List of sub-agent IDs to send the command to'),
  guidance: z.union([sparkNotifyCommandGuidanceSchema, z.null()]).describe('Guidance for the sub-agent on how to interpret and execute the command.'),
  intent: z.union([z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']), z.null()]).describe('Intent of the command.'),
  interrupt: z.union([z.enum(['force', 'soft', 'false']), z.null()]).describe('Interrupt type: force, soft, or false (no interrupt).'),
  priority: z.union([z.enum(['critical', 'high', 'normal', 'low']), z.null()]).describe('Semantic priority of the command.'),
}).strict()

export const sparkNotifyCommandSchema = z.object({
  commands: z.array(sparkNotifyCommandItemSchema).describe('List of commands to issue to sub-agents. Empty array can be used for zero commands.'),
}).strict()

export type SparkNotifyCommandSchema = z.infer<typeof sparkNotifyCommandSchema>
