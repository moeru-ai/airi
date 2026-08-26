import type { ExpressionToolResult } from '../stores/expression-store'

import { tool } from '@xsai/tool'
import { z } from 'zod'

import { useExpressionStore } from '../stores/expression-store'

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function ensureModelLoaded(): ExpressionToolResult | null {
  const store = useExpressionStore()
  if (!store.modelId || store.expressions.size === 0) {
    return { error: 'No Live2D model is currently loaded.', success: false }
  }
  return null
}

function serialize(result: ExpressionToolResult): string {
  return JSON.stringify(result)
}

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

const tools = [
  // ----- expression.set ----------------------------------------------------
  tool({
    description: [
      'Set a Live2D expression or parameter value.',
      'Use a boolean (true/false) to toggle an expression, or a number (0.0-1.0) for fine control.',
      'Optionally provide a duration in seconds for auto-reset.',
      'Examples: expression_set("Cry", true), expression_set("Blush", 0.7, 3)',
    ].join(' '),
    execute: async ({ duration, name, value }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useExpressionStore()
      const numericValue = typeof value === 'boolean' ? (value ? 1 : 0) : value
      const result = store.set(name, numericValue, duration ?? undefined)
      return serialize(result)
    },
    name: 'expression_set',
    parameters: z.object({
      duration: z.number().optional().describe('Seconds until auto-reset to default. Omit for permanent change.'),
      name: z.string().describe('Expression name or Live2D parameter ID (e.g. "Cry", "ParamWatermarkOFF")'),
      value: z.union([z.boolean(), z.number()]).describe('true/false for toggle, or 0.0-1.0 for numeric control'),
    }),
  }),

  // ----- expression.get ----------------------------------------------------
  tool({
    description: [
      'Get the current state of a Live2D expression or parameter.',
      'Omit the name to list all available expressions with their current values.',
    ].join(' '),
    execute: async ({ name }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useExpressionStore()
      const result = store.get(name ?? undefined)
      return serialize(result)
    },
    name: 'expression_get',
    parameters: z.object({
      name: z.string().optional().describe('Expression name or parameter ID. Omit to list all.'),
    }),
  }),

  // ----- expression.toggle -------------------------------------------------
  tool({
    description: [
      'Toggle a Live2D expression (flip between default and active state).',
      'Optionally provide a duration in seconds for auto-reset.',
    ].join(' '),
    execute: async ({ duration, name }) => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useExpressionStore()
      const result = store.toggle(name, duration ?? undefined)
      return serialize(result)
    },
    name: 'expression_toggle',
    parameters: z.object({
      duration: z.number().optional().describe('Seconds until auto-reset. Omit for permanent toggle.'),
      name: z.string().describe('Expression name or parameter ID to toggle'),
    }),
  }),

  // ----- expression.saveDefaults -------------------------------------------
  tool({
    description: 'Save the current expression state as the new defaults. Persists across app restarts.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useExpressionStore()
      const result = store.saveDefaults()
      return serialize(result)
    },
    name: 'expression_save_defaults',
    parameters: z.object({}),
  }),

  // ----- expression.resetAll -----------------------------------------------
  tool({
    description: 'Reset all expressions to their default values.',
    execute: async () => {
      const err = ensureModelLoaded()
      if (err)
        return serialize(err)

      const store = useExpressionStore()
      const result = store.resetAll()
      return serialize(result)
    },
    name: 'expression_reset_all',
    parameters: z.object({}),
  }),
]

/**
 * Export all expression tools as a resolved promise array, matching the
 * pattern used by other tool modules in the AIRI codebase.
 */
export const expressionTools = async () => Promise.all(tools)
