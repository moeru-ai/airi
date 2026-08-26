import type { JsonSchema } from 'xsschema'

import { ContextUpdateStrategy } from '@proj-airi/server-sdk'
import { describe, expect, it, vi } from 'vitest'

import { createSparkCommandTool } from './spark-command'

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

function getArraySchema(schema?: JsonSchema) {
  if (!schema)
    return undefined

  if (schema.type === 'array')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(isJsonSchema)
  return candidates.find(candidate => candidate?.type === 'array')
}

function getObjectSchema(schema?: JsonSchema) {
  if (!schema)
    return undefined

  if (schema.type === 'object')
    return schema

  const candidates = [...(schema.anyOf ?? []), ...(schema.oneOf ?? [])].filter(isJsonSchema)
  return candidates.find(candidate => candidate?.type === 'object')
}

function isJsonSchema(value: boolean | JsonSchema | undefined): value is JsonSchema {
  return Boolean(value && typeof value === 'object')
}

describe('tools/character/orchestrator/spark-command', () => {
  it('emits a strict parameter schema', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    expect(tools[0].function.name).toBe('builtIn_emitSparkCommand')
    expect(tools[0].function.parameters.additionalProperties).toBe(false)
  })

  it('avoids propertyNames in provider-facing schema', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    const schema = tools[0].function.parameters as JsonSchema
    const guidance = getObjectSchema(schema.properties?.guidance as JsonSchema)
    const guidancePersona = guidance?.properties?.persona as JsonSchema
    const contexts = getArraySchema(schema.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const metadata = contextItem.properties?.metadata as JsonSchema

    expect(guidancePersona.propertyNames).toBeUndefined()
    expect(metadata.propertyNames).toBeUndefined()
  })

  it('preserves heterogeneous nullable metadata values as anyOf', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    const schema = tools[0].function.parameters as JsonSchema
    const contexts = getArraySchema(schema.properties?.contexts as JsonSchema)
    const contextItem = contexts?.items as JsonSchema
    const metadata = getArraySchema(contextItem.properties?.metadata as JsonSchema)
    const metadataItem = metadata?.items as JsonSchema
    const metadataValue = metadataItem.properties?.value as JsonSchema

    // ROOT CAUSE:
    //
    // A global normalizer collapsed this union into `type: ['string', 'number',
    // 'boolean', 'null']`. The Gemini conversion in OpenRouter then removed the
    // metadata properties but kept the `required` keys.
    //
    // The tool now keeps the canonical `anyOf`. Provider adapters can convert
    // this schema when their target rejects the canonical form.
    expect(metadataValue.type).toBeUndefined()
    expect(metadataValue.anyOf).toEqual([
      { type: 'string' },
      { type: 'number' },
      { type: 'boolean' },
      { type: 'null' },
    ])
  })

  it('uses explicit required keys for nested strict option objects', async () => {
    const tools = await createSparkCommandTool({
      sendSparkCommand: () => undefined,
    })

    const schema = tools[0].function.parameters as JsonSchema
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
    const tools = await createSparkCommandTool({
      sendSparkCommand,
    })

    const result = await tools[0].execute({
      ack: 'check this',
      contexts: [{
        destinations: ['memory'],
        hints: null,
        ideas: null,
        lane: 'game',
        metadata: [
          { key: 'threat', value: 'zombie' },
          { key: 'urgent', value: true },
        ],
        strategy: ContextUpdateStrategy.AppendSelf,
        text: 'Zombie nearby',
      }],
      destinations: ['minecraft'],
      guidance: {
        options: [{
          fallback: null,
          label: 'Move',
          possibleOutcome: null,
          rationale: 'Closer inspection',
          risk: null,
          steps: ['Walk forward'],
          triggers: null,
        }],
        persona: [
          { strength: 'high', traits: 'bravery' },
        ],
        type: 'instruction',
      },
      intent: 'proposal',
      interrupt: 'soft',
      parentEventId: 'parent-1',
      priority: 'high',
    }, { messages: [], toolCallId: 'tool-call-id' })

    expect(sendSparkCommand).toHaveBeenCalledTimes(1)
    expect(sendSparkCommand).toHaveBeenCalledWith(expect.objectContaining({
      ack: 'check this',
      contexts: [expect.objectContaining({
        destinations: ['memory'],
        lane: 'game',
        metadata: {
          threat: 'zombie',
          urgent: true,
        },
        strategy: ContextUpdateStrategy.AppendSelf,
        text: 'Zombie nearby',
      })],
      destinations: ['minecraft'],
      guidance: {
        options: [{
          fallback: undefined,
          label: 'Move',
          possibleOutcome: undefined,
          rationale: 'Closer inspection',
          risk: undefined,
          steps: ['Walk forward'],
          triggers: undefined,
        }],
        persona: {
          bravery: 'high',
        },
        type: 'instruction',
      },
      intent: 'proposal',
      interrupt: 'soft',
      parentEventId: 'parent-1',
      priority: 'high',
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

  it('reports a broadcast without crashing when the channel sender clears destinations', async () => {
    // The real sendSparkCommand (stores/ai/chat-llm/llm.ts) deletes command.destinations to broadcast to every
    // authenticated peer; the success message must not then call .join on undefined.
    const sendSparkCommand = vi.fn((command: { destinations?: unknown }) => {
      delete command.destinations
    })
    const tools = await createSparkCommandTool({ sendSparkCommand })

    const result = await tools[0].execute({
      ack: null,
      contexts: null,
      destinations: [],
      guidance: null,
      intent: 'action',
      interrupt: 'soft',
      parentEventId: null,
      priority: 'normal',
    }, { messages: [], toolCallId: 'tool-call-id' })

    expect(sendSparkCommand).toHaveBeenCalledOnce()
    expect(result).toContain('spark:command sent')
    expect(result).toContain('broadcast')
  })
})
