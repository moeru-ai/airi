import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { createSparkNotifyTools } from './spark-notify'

describe('tools/character/orchestrator/spark-notify', () => {
  it('emits strict parameter objects for spark notify tools', async () => {
    const { tools } = await createSparkNotifyTools({
      onNoResponse: () => undefined,
      onCommands: () => undefined,
    })

    for (const name of ['builtIn_sparkNoResponse', 'builtIn_sparkCommand']) {
      const entry = tools.find(tool => tool.function.name === name)
      expect(entry, `missing tool: ${name}`).toBeDefined()
      expect(entry?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('normalizes spark commands before forwarding them', async () => {
    const received: unknown[] = []
    const { tools } = await createSparkNotifyTools({
      onNoResponse: () => undefined,
      onCommands: commands => received.push(...commands),
    })

    const commandTool = tools.find(tool => tool.function.name === 'builtIn_sparkCommand')
    expect(commandTool).toBeDefined()

    await commandTool!.execute({
      commands: [{
        destinations: ['minecraft'],
        interrupt: 'false',
        priority: null,
        intent: null,
        ack: '',
        guidance: {
          type: 'proposal',
          persona: [
            { traits: 'bravery', strength: 'high' },
            { traits: 'curiosity', strength: 'medium' },
          ],
          options: [{
            label: 'Investigate',
            steps: ['Walk closer', 'Observe the source'],
            rationale: null,
            possibleOutcome: [],
            risk: null,
            fallback: [],
            triggers: [],
          }],
        },
      }],
    }, { messages: [], toolCallId: 'tool-call-id' })

    expect(received).toEqual([{
      destinations: ['minecraft'],
      interrupt: false,
      priority: 'normal',
      intent: 'action',
      ack: undefined,
      contexts: [],
      guidance: {
        type: 'proposal',
        persona: {
          bravery: 'high',
          curiosity: 'medium',
        },
        options: [{
          label: 'Investigate',
          steps: ['Walk closer', 'Observe the source'],
          rationale: undefined,
          possibleOutcome: undefined,
          risk: undefined,
          fallback: undefined,
          triggers: undefined,
        }],
      },
    }])
  })

  it('uses an empty strict schema for the no-response tool', async () => {
    const { tools } = await createSparkNotifyTools({
      onNoResponse: () => undefined,
      onCommands: () => undefined,
    })

    const noResponseTool = tools.find(tool => tool.function.name === 'builtIn_sparkNoResponse')
    expect(noResponseTool).toBeDefined()
    const schema = noResponseTool!.function.parameters as JsonSchema
    expect(schema.type).toBe('object')
    expect(schema.properties).toEqual({})
    expect(schema.additionalProperties).toBe(false)
  })
})
