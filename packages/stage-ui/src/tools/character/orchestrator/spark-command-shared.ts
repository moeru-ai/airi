import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { z } from 'zod/v4'

export const sparkCommandIntentSchema = z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context'])
export const sparkCommandPrioritySchema = z.enum(['critical', 'high', 'normal', 'low'])
export const sparkCommandInterruptSchema = z.union([z.literal('force'), z.literal('soft'), z.literal(false)])

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
  persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe('Personas can be used to adjust the behavior of sub-agents. For example, when using as NPC in games, or player in Minecraft, the persona can help define the character\'s traits and decision-making style.'),
  type: z.enum(['proposal', 'instruction', 'memory-recall']),
}).strict()

export const sparkNotifyCommandItemSchema = z.object({
  ack: z.string().describe('Acknowledgment content used to be passed to sub-agents upon command receipt.'),
  destinations: z.array(z.string()).min(1).describe('List of sub-agent IDs to send the command to'),
  guidance: z.union([sparkNotifyCommandGuidanceSchema, z.null()]).describe('Guidance for the sub-agent on how to interpret and execute the command with given context, persona settings, and reasoning.'),
  intent: z.union([z.enum(['plan', 'proposal', 'action', 'pause', 'resume', 'reroute', 'context']), z.null()]).describe('Intent of the command, indicating the nature of the instruction. If you attend to call other tools, use "plan" to reply with quick response to corresponding module / sub-agent.'),
  interrupt: z.union([z.enum(['force', 'soft', 'false']), z.null()]).describe('Interrupt type: force, soft, or false (no interrupt). A option to control whether this command is urgent enough to preempt ongoing tasks and require immediate attention.'),
  priority: z.union([z.enum(['critical', 'high', 'normal', 'low']), z.null()]).describe('Semantic priority of the command, this affects how sub-agents prioritize it (queues, interruption queues, mq, etc.).'),
}).strict()

export const sparkCommandMetadataEntrySchema = z.object({
  key: z.string().describe('Metadata key.'),
  value: z.union([z.string(), z.number(), z.boolean(), z.null()]).describe('Metadata value.'),
}).strict()

export const sparkCommandContextSchema = z.object({
  destinations: z.union([
    z.array(z.string()),
    z.object({
      all: z.literal(true),
    }).strict(),
    z.object({
      exclude: z.union([z.array(z.string()), z.null()]).describe('Excluded destinations.'),
      include: z.union([z.array(z.string()), z.null()]).describe('Included destinations.'),
    }).strict(),
  ]).nullable().describe('Optional routing for the attached context update.'),
  hints: z.union([z.array(z.string()), z.null()]).describe('Hints to attach to the target context.'),
  ideas: z.union([z.array(z.string()), z.null()]).describe('Loose ideas to attach to the target context.'),
  lane: z.union([z.string(), z.null()]).describe('Logical context lane, for example "game" or "memory".'),
  metadata: z.union([z.array(sparkCommandMetadataEntrySchema), z.null()]).describe('JSON-like metadata for the context update, expressed as key-value pairs for schema compatibility.'),
  strategy: z.enum(ContextUpdateStrategy).describe('How the target should merge this context update.'),
  text: z.string().describe('Primary text of the context update.'),
}).strict()

export const sparkCommandGuidanceSchema = z.object({
  options: z.array(sparkCommandGuidanceOptionSchema).min(1).describe('Concrete execution options for the target.'),
  persona: z.union([z.array(sparkCommandPersonaSchema), z.null()]).describe('Persona traits that shape the target behavior.'),
  type: z.enum(['proposal', 'instruction', 'memory-recall']),
}).strict()

export const sparkCommandToolSchema = z.object({
  ack: z.union([z.string(), z.null()]).describe('Short acknowledgement or instruction summary for the receiver.'),
  contexts: z.union([z.array(sparkCommandContextSchema), z.null()]).describe('Optional context updates to attach to the command.'),
  destinations: z.array(z.string()).min(1).describe('One or more target module or agent IDs for this command.'),
  guidance: z.union([sparkCommandGuidanceSchema, z.null()]).describe('Structured guidance for how the target should interpret and execute the command.'),
  intent: z.union([sparkCommandIntentSchema, z.null()]).describe('Intent of the command.'),
  // NOTICE: Azure/OpenAI-compatible tool validators reject strict object schemas when some
  // properties are optional. These root fields stay required in the provider-facing schema
  // and use `null` as the "not supplied" value, then runtime code normalizes them back to
  // `undefined` or defaults before emitting `spark:command`.
  interrupt: z.union([sparkCommandInterruptSchema, z.null()]).describe('Whether the command should preempt current work.'),
  parentEventId: z.union([z.string(), z.null()]).describe('Optional parent event ID when this command is a response to another event.'),
  priority: z.union([sparkCommandPrioritySchema, z.null()]).describe('Priority of the command.'),
}).strict()

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
    exclude,
    include,
  }
}

export function normalizeSparkCommandGuidanceOptions(
  options: z.infer<typeof sparkCommandGuidanceOptionSchema>[],
) {
  // NOTICE: Provider-facing schemas keep nullable fields required so strict-object validation
  // passes on Azure/OpenAI-compatible providers. Runtime guidance objects use omitted fields
  // instead of `null`, so this strips empty/null values back to the original event shape.
  return options.map(option => ({
    ...option,
    fallback: option.fallback?.length ? option.fallback : undefined,
    possibleOutcome: option.possibleOutcome?.length ? option.possibleOutcome : undefined,
    rationale: option.rationale ?? undefined,
    risk: option.risk ?? undefined,
    triggers: option.triggers?.length ? option.triggers : undefined,
  }))
}

export function normalizeSparkCommandMetadata(
  metadata: undefined | z.infer<typeof sparkCommandMetadataEntrySchema>[],
): Record<string, boolean | null | number | string> | undefined {
  // NOTICE: Provider-facing schemas model metadata as `[{ key, value }]` because
  // `z.record(...)` emits `propertyNames`, which OpenAI-compatible validators may reject.
  // Runtime `spark:command` events still expect a plain object map, so we rebuild that here.
  if (!metadata?.length)
    return undefined

  return metadata.reduce<Record<string, boolean | null | number | string>>((acc, entry) => {
    acc[entry.key] = entry.value
    return acc
  }, {})
}

export function normalizeSparkCommandPersona(
  persona: undefined | z.infer<typeof sparkCommandPersonaSchema>[],
): Record<string, 'high' | 'low' | 'medium' | 'very-high' | 'very-low'> | undefined {
  // NOTICE: Persona traits are exposed to providers as an array of `{ traits, strength }`
  // entries for schema compatibility. The channel-server event shape uses a record keyed by
  // trait name instead, so this collapses the provider-safe array back into that runtime map.
  if (!persona?.length)
    return undefined

  return persona.reduce<Record<string, 'high' | 'low' | 'medium' | 'very-high' | 'very-low'>>((acc, entry) => {
    acc[entry.traits] = entry.strength
    return acc
  }, {})
}

export function normalizeSparkCommandStringList(value: null | string[]): string[] | undefined {
  // NOTICE: Several provider-facing fields are required-but-nullable to satisfy strict object
  // validation. Runtime context updates treat missing lists as omitted, not `null` or `[]`.
  return value?.length ? value : undefined
}

export function normalizeSparkCommandStringValue(value: null | string): string | undefined {
  // NOTICE: Required-but-nullable provider fields are normalized back to the runtime
  // convention of omitting absent scalar values with `undefined`.
  return value ?? undefined
}
