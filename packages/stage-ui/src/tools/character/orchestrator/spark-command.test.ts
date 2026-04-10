import type { JsonSchema } from 'xsschema'

import z from 'zod/v4'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { rawTool } from '@xsai/tool'
import { describe, expect, it, vi } from 'vitest'
import { toJsonSchema } from 'xsschema'

import { createSparkCommandTool } from './spark-command'
import { normalizeNullableAnyOf, sparkNotifyCommandItemSchema } from './spark-command-shared'

function isJsonSchema(value: JsonSchema | boolean | undefined): value is JsonSchema {
  return Boolean(value && typeof value === 'object')
}

function getObjectSchema(schema?: JsonSchema) {
  if (!schema)
    return undefined

  if (schema.type === 'object')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(isJsonSchema)
  return candidates.find(candidate => candidate?.type === 'object')
}

function getArraySchema(schema?: JsonSchema) {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(isJsonSchema)
  return candidates.find(candidate => candidate?.type === 'array')
}

function findObjectSchema(schema: JsonSchema | undefined, predicate: (schema: JsonSchema) => boolean): JsonSchema | undefined {
  if (!schema)
    return undefined

  const objectSchema = getObjectSchema(schema)
  if (objectSchema && predicate(objectSchema))
    return objectSchema

  for (const candidate of [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(isJsonSchema)) {
    const found = findObjectSchema(candidate, predicate)
    if (found)
      return found
  }

  return undefined
}

describe('tools/character/orchestrator/spark-command', () => {
  it('normalizes scalar|null anyOf into a type array', async () => {
    const schemaTestUnion = await toJsonSchema(z.object({
      testField: z.union([z.string(), z.null()]),
    }))
    const normalized = normalizeNullableAnyOf(schemaTestUnion as JsonSchema)

    expect((normalized.properties?.testField as JsonSchema).type).toEqual(['string', 'null'])
    expect((normalized.properties?.testField as JsonSchema).anyOf).toBeUndefined()
  })

  it('deduplicates primitive types after normalization', async () => {
    const schemaTestUnion = await toJsonSchema(z.object({
      testField: z.union([z.literal('force'), z.literal('soft'), z.literal(false)]),
    }))
    const normalized = normalizeNullableAnyOf(schemaTestUnion as JsonSchema)

    expect((normalized.properties?.testField as JsonSchema).type).toEqual(['string', 'boolean'])
    expect((normalized.properties?.testField as JsonSchema).anyOf).toBeUndefined()
  })

  it('should render sparkNotifyCommandItemSchema into correct schema', async () => {
    const schemaTest = await toJsonSchema(sparkNotifyCommandItemSchema)
    const normalized = normalizeNullableAnyOf(schemaTest as JsonSchema)

    const res = rawTool({
      name: 'test_tool',
      strict: true,
      parameters: normalized,
      execute: () => ({ success: true }),
    })
    expect(res.function.parameters).toStrictEqual(normalized)
  })

  it('emits a strict parameter schema', async () => {
    const tool = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    expect(tool.function.name).toBe('builtIn_emitSparkCommand')
    expect(tool.function.parameters.additionalProperties).toBe(false)
  })

  it('avoids propertyNames in provider-facing schema', async () => {
    const tool = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    const schema = tool.function.parameters as JsonSchema
    const guidance = getObjectSchema(schema.properties?.guidance as JsonSchema)
    const guidancePersona = guidance?.properties?.persona as JsonSchema
    const contexts = getArraySchema(schema.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const metadata = contextItem.properties?.metadata as JsonSchema

    expect(guidancePersona.propertyNames).toBeUndefined()
    expect(metadata.propertyNames).toBeUndefined()
  })

  it('uses explicit required keys for nested strict option objects', async () => {
    const tool = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    const schema = tool.function.parameters as JsonSchema
    expect(schema.required).toEqual([
      'destinations',
      'interrupt',
      'priority',
      'intent',
      'ack',
      'parentEventId',
      'guidance',
      'contexts',
    ])
    const guidance = getObjectSchema(schema.properties?.guidance as JsonSchema)
    const options = guidance?.properties?.options as JsonSchema
    const optionItem = options.items as JsonSchema
    const contexts = getArraySchema(schema.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const destinations = contextItem.properties?.destinations as JsonSchema
    const destinationsFilter = findObjectSchema(
      destinations,
      candidate => Boolean(candidate.properties?.include || candidate.properties?.exclude),
    )

    expect(guidance?.required).toEqual([
      'type',
      'persona',
      'options',
    ])
    expect(optionItem.required).toEqual([
      'label',
      'steps',
      'rationale',
      'possibleOutcome',
      'risk',
      'fallback',
      'triggers',
    ])
    expect(contextItem.required).toEqual([
      'lane',
      'ideas',
      'hints',
      'strategy',
      'text',
      'destinations',
      'metadata',
    ])
    expect(destinationsFilter?.required).toEqual([
      'include',
      'exclude',
    ])
  })

  it('builds and dispatches spark commands with generated ids', async () => {
    const sendSparkCommand = vi.fn()
    const tool = await createSparkCommandTool({
      sendSparkCommand,
    })

    const result = await tool.execute({
      destinations: ['minecraft'],
      interrupt: 'soft',
      priority: 'high',
      intent: 'proposal',
      ack: 'check this',
      parentEventId: 'parent-1',
      guidance: {
        type: 'instruction',
        persona: [
          { traits: 'bravery', strength: 'high' },
        ],
        options: [{
          label: 'Move',
          steps: ['Walk forward'],
          rationale: 'Closer inspection',
          possibleOutcome: null,
          risk: null,
          fallback: null,
          triggers: null,
        }],
      },
      contexts: [{
        lane: 'game',
        ideas: null,
        hints: null,
        strategy: ContextUpdateStrategy.AppendSelf,
        text: 'Zombie nearby',
        destinations: ['memory'],
        metadata: [
          { key: 'threat', value: 'zombie' },
          { key: 'urgent', value: true },
        ],
      }],
    }, { messages: [], toolCallId: 'tool-call-id' })

    expect(sendSparkCommand).toHaveBeenCalledTimes(1)
    expect(sendSparkCommand).toHaveBeenCalledWith(expect.objectContaining({
      parentEventId: 'parent-1',
      interrupt: 'soft',
      priority: 'high',
      intent: 'proposal',
      ack: 'check this',
      destinations: ['minecraft'],
      guidance: {
        type: 'instruction',
        persona: {
          bravery: 'high',
        },
        options: [{
          label: 'Move',
          steps: ['Walk forward'],
          rationale: 'Closer inspection',
          possibleOutcome: undefined,
          risk: undefined,
          fallback: undefined,
          triggers: undefined,
        }],
      },
      contexts: [expect.objectContaining({
        lane: 'game',
        strategy: ContextUpdateStrategy.AppendSelf,
        text: 'Zombie nearby',
        destinations: ['memory'],
        metadata: {
          threat: 'zombie',
          urgent: true,
        },
      })],
    }))

    const command = sendSparkCommand.mock.calls[0][0]
    expect(command.id).toEqual(expect.any(String))
    expect(command.eventId).toEqual(expect.any(String))
    expect(command.commandId).toEqual(expect.any(String))
    expect(command.contexts?.[0].id).toEqual(expect.any(String))
    expect(command.contexts?.[0].contextId).toEqual(expect.any(String))
    expect(result).toContain('spark:command sent')
    expect(result).toContain(command.commandId)
  })
})
