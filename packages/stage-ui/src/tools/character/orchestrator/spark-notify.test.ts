import type { JsonSchema } from 'xsschema'

import { describe, expect, it } from 'vitest'

import { createSparkNotifyTools } from './spark-notify'

describe('tools/character/orchestrator/spark-notify', () => {
  it('emits strict parameter objects for spark notify tools', async () => {
    const { tools } = await createSparkNotifyTools({
      onCommands: () => undefined,
      onNoResponse: () => undefined,
    })

    expect(tools).toHaveLength(2)
    for (const name of ['builtIn_sparkNoResponse', 'builtIn_sparkCommand']) {
      const entry = tools.find(tool => tool.function.name === name)
      expect(entry, `missing tool: ${name}`).toBeDefined()
      expect(entry?.function.parameters.additionalProperties).toBe(false)
    }
  })

  it('normalizes spark commands before forwarding them', async () => {
    const received: unknown[] = []
    const { tools } = await createSparkNotifyTools({
      onCommands: commands => received.push(...commands),
      onNoResponse: () => undefined,
    })

    const commandTool = tools.find(tool => tool.function.name === 'builtIn_sparkCommand')
    expect(commandTool).toBeDefined()

    await commandTool!.execute({
      commands: [{
        ack: '',
        destinations: ['minecraft'],
        guidance: {
          options: [{
            fallback: [],
            label: 'Investigate',
            possibleOutcome: [],
            rationale: null,
            risk: null,
            steps: ['Walk closer', 'Observe the source'],
            triggers: [],
          }],
          persona: [
            { strength: 'high', traits: 'bravery' },
            { strength: 'medium', traits: 'curiosity' },
          ],
          type: 'proposal',
        },
        intent: null,
        interrupt: 'false',
        priority: null,
      }],
    }, { messages: [], toolCallId: 'tool-call-id' })

    expect(received).toEqual([{
      ack: undefined,
      contexts: [],
      destinations: ['minecraft'],
      guidance: {
        options: [{
          fallback: undefined,
          label: 'Investigate',
          possibleOutcome: undefined,
          rationale: undefined,
          risk: undefined,
          steps: ['Walk closer', 'Observe the source'],
          triggers: undefined,
        }],
        persona: {
          bravery: 'high',
          curiosity: 'medium',
        },
        type: 'proposal',
      },
      intent: 'action',
      interrupt: false,
      priority: 'normal',
    }])
  })

  it('uses an empty strict schema for the no-response tool', async () => {
    const { tools } = await createSparkNotifyTools({
      onCommands: () => undefined,
      onNoResponse: () => undefined,
    })

    const noResponseTool = tools.find(tool => tool.function.name === 'builtIn_sparkNoResponse')
    expect(noResponseTool).toBeDefined()
    const schema = noResponseTool!.function.parameters as JsonSchema
    expect(schema.type).toBe('object')
    expect(schema.properties).toEqual({})
    expect(schema.additionalProperties).toBe(false)
  })

  it('can disable no-response and spark-command tools independently', async () => {
    const onlyCommand = await createSparkNotifyTools({
      allowNoResponse: false,
      allowSparkCommand: true,
      onCommands: () => undefined,
      onNoResponse: () => undefined,
    })
    expect(onlyCommand.tools.map(tool => tool.function.name)).toEqual(['builtIn_sparkCommand'])

    const none = await createSparkNotifyTools({
      allowNoResponse: false,
      allowSparkCommand: false,
      onCommands: () => undefined,
      onNoResponse: () => undefined,
    })
    expect(none.tools).toHaveLength(0)
  })
})
