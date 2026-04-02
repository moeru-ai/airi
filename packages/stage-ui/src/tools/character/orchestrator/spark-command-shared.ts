import type { JsonSchema } from 'xsschema'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { z } from 'zod/v4'

const JSON_SCHEMA_NULLABLE_SCALAR_TYPES = new Set(['string', 'number', 'integer', 'boolean', 'null'])

export const sparkCommandIntentSchema = z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context'])
export const sparkCommandPrioritySchema = z.enum(['critical', 'high', 'normal', 'low'])
export const sparkCommandInterruptSchema = z.union([z.literal('force'), z.literal('soft'), z.literal(false)])

export const sparkCommandGuidanceOptionSchema = z.object({
  label: z.string().describe('Short label for the option.'),
  steps: z.array(z.string()).min(1).describe('Step-by-step actions the target should follow.'),
  rationale: z.union([z.string(), z.null()]).describe('Why this option makes sense.'),
  possibleOutcome: z.union([z.array(z.string()), z.null()]).describe('Expected outcomes if this option is followed.'),
  risk: z.union([z.enum(['high', 'medium', 'low', 'none']), z.null()]).describe('Risk level of this option.'),
  fallback: z.union([z.array(z.string()), z.null()]).describe('Fallback steps if the main plan fails.'),
  triggers: z.union([z.array(z.string()), z.null()]).describe('Conditions that should trigger this option.'),
}).strict()

export const sparkCommandPersonaSchema = z.object({
  traits: z.string().describe('Trait name to adjust behavior. For example, "bravery", "cautiousness", "friendliness".'),
  strength: z.enum(['very-high', 'high', 'medium', 'low', 'very-low']),
}).strict()

export const sparkNotifyCommandGuidanceSchema = z.object({
  type: z.enum(['proposal', 'instruction', 'memory-recall']),
  persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe('Personas can be used to adjust the behavior of sub-agents. For example, when using as NPC in games, or player in Minecraft, the persona can help define the character\'s traits and decision-making style.'),
  options: z.array(sparkCommandGuidanceOptionSchema),
}).strict()

export const sparkNotifyCommandItemSchema = z.object({
  destinations: z.array(z.string()).min(1).describe('List of sub-agent IDs to send the command to'),
  interrupt: z.union([z.enum(['force', 'soft', 'false']), z.null()]).describe('Interrupt type: force, soft, or false (no interrupt). A option to control whether this command is urgent enough to preempt ongoing tasks and require immediate attention.'),
  priority: z.union([z.enum(['critical', 'high', 'normal', 'low']), z.null()]).describe('Semantic priority of the command, this affects how sub-agents prioritize it (queues, interruption queues, mq, etc.).'),
  intent: z.union([z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']), z.null()]).describe('Intent of the command, indicating the nature of the instruction. If you attend to call other tools, use "plan" to reply with quick response to corresponding module / sub-agent.'),
  ack: z.string().describe('Acknowledgment content used to be passed to sub-agents upon command receipt.'),
  guidance: z.union([sparkNotifyCommandGuidanceSchema, z.null()]).describe('Guidance for the sub-agent on how to interpret and execute the command with given context, persona settings, and reasoning.'),
}).strict()

export const sparkCommandMetadataEntrySchema = z.object({
  key: z.string().describe('Metadata key.'),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe('Metadata value.'),
}).strict()

export const sparkCommandContextSchema = z.object({
  lane: z.union([z.string(), z.null()]).describe('Logical context lane, for example "game" or "memory".'),
  ideas: z.union([z.array(z.string()), z.null()]).describe('Loose ideas to attach to the target context.'),
  hints: z.union([z.array(z.string()), z.null()]).describe('Hints to attach to the target context.'),
  strategy: z.enum(ContextUpdateStrategy).describe('How the target should merge this context update.'),
  text: z.string().describe('Primary text of the context update.'),
  destinations: z.union([
    z.array(z.string()),
    z.object({
      all: z.literal(true),
    }).strict(),
    z.object({
      include: z.union([z.array(z.string()), z.null()]).describe('Included destinations.'),
      exclude: z.union([z.array(z.string()), z.null()]).describe('Excluded destinations.'),
    }).strict(),
  ]).nullable().describe('Optional routing for the attached context update.'),
  metadata: z.union([z.array(sparkCommandMetadataEntrySchema), z.null()]).describe('JSON-like metadata for the context update, expressed as key-value pairs for schema compatibility.'),
}).strict()

export const sparkCommandGuidanceSchema = z.object({
  type: z.enum(['proposal', 'instruction', 'memory-recall']),
  persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe('Persona traits that shape the target behavior.'),
  options: z.array(sparkCommandGuidanceOptionSchema).min(1).describe('Concrete execution options for the target.'),
}).strict()

export const sparkCommandToolSchema = z.object({
  destinations: z.array(z.string()).min(1).describe('One or more target module or agent IDs for this command.'),
  // NOTICE: Azure/OpenAI-compatible tool validators reject strict object schemas when some
  // properties are optional. These root fields stay required in the provider-facing schema
  // and use `null` as the "not supplied" value, then runtime code normalizes them back to
  // `undefined` or defaults before emitting `spark:command`.
  interrupt: z.union([sparkCommandInterruptSchema, z.null()]).describe('Whether the command should preempt current work.'),
  priority: z.union([sparkCommandPrioritySchema, z.null()]).describe('Priority of the command.'),
  intent: z.union([sparkCommandIntentSchema, z.null()]).describe('Intent of the command.'),
  ack: z.union([z.string(), z.null()]).describe('Short acknowledgement or instruction summary for the receiver.'),
  parentEventId: z.union([z.string(), z.null()]).describe('Optional parent event ID when this command is a response to another event.'),
  guidance: z.union([sparkCommandGuidanceSchema, z.null()]).describe('Structured guidance for how the target should interpret and execute the command.'),
  contexts: z.union([z.array(sparkCommandContextSchema), z.null()]).describe('Optional context updates to attach to the command.'),
}).strict()

export function normalizeSparkCommandMetadata(
  metadata: z.infer<typeof sparkCommandMetadataEntrySchema>[] | undefined,
): Record<string, string | number | boolean | null> | undefined {
  // NOTICE: Provider-facing schemas model metadata as `[{ key, value }]` because
  // `z.record(...)` emits `propertyNames`, which OpenAI-compatible validators may reject.
  // Runtime `spark:command` events still expect a plain object map, so we rebuild that here.
  if (!metadata?.length)
    return undefined

  return metadata.reduce<Record<string, string | number | boolean | null>>((acc, entry) => {
    acc[entry.key] = entry.value
    return acc
  }, {})
}

export function normalizeSparkCommandPersona(
  persona: z.infer<typeof sparkCommandPersonaSchema>[] | undefined,
): Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'> | undefined {
  // NOTICE: Persona traits are exposed to providers as an array of `{ traits, strength }`
  // entries for schema compatibility. The channel-server event shape uses a record keyed by
  // trait name instead, so this collapses the provider-safe array back into that runtime map.
  if (!persona?.length)
    return undefined

  return persona.reduce<Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>>((acc, entry) => {
    acc[entry.traits] = entry.strength
    return acc
  }, {})
}

export function normalizeSparkCommandGuidanceOptions(
  options: z.infer<typeof sparkCommandGuidanceOptionSchema>[],
) {
  // NOTICE: Provider-facing schemas keep nullable fields required so strict-object validation
  // passes on Azure/OpenAI-compatible providers. Runtime guidance objects use omitted fields
  // instead of `null`, so this strips empty/null values back to the original event shape.
  return options.map(option => ({
    ...option,
    rationale: option.rationale ?? undefined,
    possibleOutcome: option.possibleOutcome?.length ? option.possibleOutcome : undefined,
    risk: option.risk ?? undefined,
    fallback: option.fallback?.length ? option.fallback : undefined,
    triggers: option.triggers?.length ? option.triggers : undefined,
  }))
}

export function normalizeSparkCommandDestinations(
  destinations: z.infer<typeof sparkCommandContextSchema>['destinations'],
) {
  // NOTICE: The provider schema keeps destination filters nullable and fully required inside
  // the strict object branch. Runtime context updates only want meaningful routing filters, so
  // this removes null/empty filter values and returns `undefined` when no routing remains.
  if (destinations == null)
    return undefined

  if (Array.isArray(destinations) || 'all' in destinations)
    return destinations

  const include = destinations.include?.length ? destinations.include : undefined
  const exclude = destinations.exclude?.length ? destinations.exclude : undefined

  if (!include && !exclude)
    return undefined

  return {
    include,
    exclude,
  }
}

export function normalizeSparkCommandStringList(value: string[] | null): string[] | undefined {
  // NOTICE: Several provider-facing fields are required-but-nullable to satisfy strict object
  // validation. Runtime context updates treat missing lists as omitted, not `null` or `[]`.
  return value?.length ? value : undefined
}

export function normalizeSparkCommandStringValue(value: string | null): string | undefined {
  // NOTICE: Required-but-nullable provider fields are normalized back to the runtime
  // convention of omitting absent scalar values with `undefined`.
  return value ?? undefined
}

function isJsonSchema(value: JsonSchema | boolean | JsonSchema[] | undefined): value is JsonSchema {
  return Boolean(value && !Array.isArray(value) && typeof value === 'object')
}

export function normalizeNullableAnyOf(schema: JsonSchema): JsonSchema {
  // NOTICE: `xsschema` emits nullable unions like `string | null` as `anyOf`, but some
  // OpenAI-compatible validators reject those forms while accepting `type: ['string', 'null']`.
  // We only collapse scalar-or-null unions here; object unions must remain untouched so their
  // nested `required` and `additionalProperties` constraints survive provider validation.
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
