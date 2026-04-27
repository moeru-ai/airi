import type { ContextUpdate } from '@proj-airi/server-sdk'

import { errorMessageFrom } from '@moeru/std'
import { rawTool } from '@xsai/tool'
import { toJsonSchema, validate } from 'xsschema'
import { z } from 'zod'

import {
  normalizeNullableAnyOf,
  sparkNotifyCommandSchema,
} from './schema'

export interface SparkNotifyCommandDraft {
  destinations: string[]
  interrupt?: 'force' | 'soft' | boolean
  priority?: 'critical' | 'high' | 'normal' | 'low'
  intent?: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  ack?: string
  guidance?: {
    type: 'proposal' | 'instruction' | 'memory-recall'
    persona?: Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>
    options: Array<{
      label: string
      steps: string[]
      rationale?: string
      possibleOutcome?: string[]
      risk?: 'high' | 'medium' | 'low' | 'none'
      fallback?: string[]
      triggers?: string[]
    }>
  }
  contexts?: ContextUpdate<Record<string, unknown>, undefined>[]
}

export interface CreateSparkNotifyToolsOptions {
  onCommands: (commands: SparkNotifyCommandDraft[]) => void
  onNoResponse: () => void
  /**
   * Whether to expose the `builtIn_sparkNoResponse` tool.
   *
   * @default true
   */
  allowNoResponse?: boolean
  /**
   * Whether to expose the `builtIn_sparkCommand` tool.
   *
   * @default true
   */
  allowSparkCommand?: boolean
}

/**
 * Normalizes provider-facing notify command payloads into websocket draft commands.
 *
 * Use when:
 * - LLM output has been validated against `sparkNotifyCommandSchema`
 * - You need `spark:command`-compatible draft objects
 *
 * Expects:
 * - Input shape from one `commands[]` entry
 *
 * Returns:
 * - Runtime-ready command draft for downstream emitters
 */
function normalizeSparkNotifyCommand(
  command: z.infer<typeof sparkNotifyCommandSchema>['commands'][number],
): SparkNotifyCommandDraft {
  return {
    destinations: command.destinations,
    guidance: command.guidance
      ? {
          type: command.guidance.type,
          persona: command.guidance.persona?.reduce((acc, curr) => {
            acc[curr.traits] = curr.strength
            return acc
          }, {} as Record<string, 'very-high' | 'high' | 'medium' | 'low' | 'very-low'>) || undefined,
          options: command.guidance.options.map(option => ({
            ...option,
            rationale: option.rationale ?? undefined,
            possibleOutcome: option.possibleOutcome?.length ? option.possibleOutcome : undefined,
            risk: option.risk ?? undefined,
            fallback: option.fallback?.length ? option.fallback : undefined,
            triggers: option.triggers?.length ? option.triggers : undefined,
          })),
        }
      : undefined,
    // TODO: contexts can be added later
    contexts: [],
    priority: command.priority || 'normal',
    intent: command.intent || 'action',
    ack: command.ack || undefined,
    interrupt: command.interrupt === 'false' || command.interrupt == null ? false : command.interrupt,
  }
}

/**
 * Creates built-in tools used by the Spark Notify agent.
 *
 * Use when:
 * - Running the Spark Notify agent on any runtime (web, desktop, eval harness)
 * - You need "no response" and "command draft" tool pathways
 *
 * Expects:
 * - Callbacks for command collection and no-response signaling
 *
 * Returns:
 * - Tool array consumable by `@xsai/stream-text`
 */
export async function createSparkNotifyTools(options: CreateSparkNotifyToolsOptions) {
  const { allowNoResponse = true, allowSparkCommand = true } = options

  const tools: Array<ReturnType<typeof rawTool>> = []

  if (allowNoResponse) {
    tools.push(rawTool({
      name: 'builtIn_sparkNoResponse',
      description: 'Indicate that no response or action is needed for the current spark:notify event.',
      parameters: normalizeNullableAnyOf(await toJsonSchema(z.object({}).strict()) as any),
      execute: async () => {
        options.onNoResponse()
        return 'AIRI System: Acknowledged, no response or action will be processed.'
      },
    }))
  }

  if (allowSparkCommand) {
    tools.push(rawTool({
      name: 'builtIn_sparkCommand',
      description: 'Issue a spark:command to sub-agents. You can call this tool multiple times.',
      parameters: normalizeNullableAnyOf(await toJsonSchema(sparkNotifyCommandSchema) as any),
      execute: async (rawPayload) => {
        try {
          const payload = rawPayload as z.infer<typeof sparkNotifyCommandSchema>
          const validated = await validate(sparkNotifyCommandSchema, payload)
          options.onCommands(validated.commands.map(normalizeSparkNotifyCommand))
        }
        catch (error) {
          return `AIRI System: Error - invalid spark_command parameters: ${errorMessageFrom(error)}`
        }

        return 'AIRI System: Acknowledged, command fired.'
      },
    }))
  }

  return { tools }
}
