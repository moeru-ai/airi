import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it } from 'vitest'

import { installStrictToolSchemaMatchers } from './strict-tool-schema'

installStrictToolSchemaMatchers()

function createTool(parameters: unknown): Tool {
  return {
    function: {
      description: 'Test tool.',
      name: 'test_tool',
      parameters,
    },
    type: 'function',
  } as Tool
}

describe('strict tool schema matchers', () => {
  /**
   * @example
   * expect(tool).toSatisfyStrictToolSchema()
   */
  it('accepts a strict provider-safe tool schema', () => {
    const tool = createTool({
      additionalProperties: false,
      properties: {
        mode: {
          type: ['string', 'null'],
        },
      },
      required: ['mode'],
      type: 'object',
    })

    expect(tool).toSatisfyStrictToolSchema()
  })

  /**
   * @example
   * expect(() => expect(tool).toSatisfyStrictToolSchema()).toThrow(/mode/)
   */
  it('reports missing required keys with schema paths', () => {
    const tool = createTool({
      additionalProperties: false,
      properties: {
        mode: {
          type: ['string', 'null'],
        },
      },
      required: [],
      type: 'object',
    })

    expect(() => expect(tool).toSatisfyStrictToolSchema()).toThrow(/test_tool\.parameters.*mode/)
  })

  /**
   * @example
   * expect([tool]).toSatisfyStrictToolSchemas()
   */
  it('checks a list of tools', () => {
    const tool = createTool({
      additionalProperties: false,
      properties: {},
      required: [],
      type: 'object',
    })

    expect([tool]).toSatisfyStrictToolSchemas()
  })
})
