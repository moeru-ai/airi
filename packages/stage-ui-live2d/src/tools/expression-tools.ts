import type { Live2DExpressionResult, Live2DExpressionsContext } from '../contexts/expressions'

import { tool } from '@xsai/tool'
import { z } from 'zod'

function modelError(expressions: Live2DExpressionsContext): Live2DExpressionResult | undefined {
  if (!expressions.modelId.value || expressions.parameters.value.size === 0)
    return { success: false, error: 'No Live2D model is loaded.' }
}

function serialize(result: Live2DExpressionResult): string {
  return JSON.stringify(result)
}

/** Creates expression tools for one Live2D Root instance. */
export async function createLive2DExpressionTools(expressions: Live2DExpressionsContext) {
  const tools = [
    tool({
      name: 'expression_set',
      description: [
        'Set a Live2D expression or parameter value.',
        'Use a boolean to toggle an expression.',
        'Use a number from 0.0 through 1.0 for direct control.',
        'The optional duration resets the value after the specified number of seconds.',
      ].join(' '),
      execute: async ({ name, value, duration }) => {
        const error = modelError(expressions)
        if (error)
          return serialize(error)

        return serialize(expressions.set(name, value, duration ?? undefined))
      },
      parameters: z.object({
        name: z.string().describe('Expression name or Live2D parameter ID'),
        value: z.union([z.boolean(), z.number()]).describe('Boolean toggle or numeric value'),
        duration: z.number().optional().describe('Seconds before the value resets'),
      }),
    }),
    tool({
      name: 'expression_get',
      description: 'Get one Live2D expression value. Omit the name to get all values.',
      execute: async ({ name }) => {
        const error = modelError(expressions)
        if (error)
          return serialize(error)

        return serialize(expressions.get(name ?? undefined))
      },
      parameters: z.object({
        name: z.string().optional().describe('Expression name or parameter ID'),
      }),
    }),
    tool({
      name: 'expression_toggle',
      description: 'Toggle one Live2D expression. The optional duration resets the expression.',
      execute: async ({ name, duration }) => {
        const error = modelError(expressions)
        if (error)
          return serialize(error)

        return serialize(expressions.toggle(name, duration ?? undefined))
      },
      parameters: z.object({
        name: z.string().describe('Expression name or parameter ID'),
        duration: z.number().optional().describe('Seconds before the expression resets'),
      }),
    }),
    tool({
      name: 'expression_reset_all',
      description: 'Reset all Live2D expressions to their model defaults.',
      execute: async () => {
        const error = modelError(expressions)
        if (error)
          return serialize(error)

        return serialize(expressions.reset())
      },
      parameters: z.object({}),
    }),
  ]

  return Promise.all(tools)
}
