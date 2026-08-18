import type { Tool } from '@xsai/shared-chat'

import { describe, expect, it } from 'vitest'

import { installStrictToolSchemaMatchers } from './strict-tool-schema'

installStrictToolSchemaMatchers()

function createTool(parameters: unknown): Tool {
  return {
    type: 'function',
    function: {
      name: 'test_tool',
      description: 'Test tool.',
      parameters,
    },
  } as Tool
}

describe('strict tool schema matchers', () => {
  /**
   * @example
   * expect(tool).toSatisfyStrictToolSchema()
   */
  it('accepts a strict provider-safe tool schema', () => {
    const tool = createTool({
      type: 'object',
      properties: {
        mode: {
          type: ['string', 'null'],
        },
      },
      required: ['mode'],
      additionalProperties: false,
    })

    expect(tool).toSatisfyStrictToolSchema()
  })

  /**
   * @example
   * expect(() => expect(tool).toSatisfyStrictToolSchema()).toThrow(/mode/)
   */
  it('reports missing required keys with schema paths', () => {
    const tool = createTool({
      type: 'object',
      properties: {
        mode: {
          type: ['string', 'null'],
        },
      },
      required: [],
      additionalProperties: false,
    })

    expect(() => expect(tool).toSatisfyStrictToolSchema()).toThrow(/test_tool\.parameters.*mode/)
  })

  /**
   * @example
   * expect([tool]).toSatisfyStrictToolSchemas()
   */
  it('checks a list of tools', () => {
    const tool = createTool({
      type: 'object',
      properties: {},
      required: [],
      additionalProperties: false,
    })

    expect([tool]).toSatisfyStrictToolSchemas()
  })
})
