import type { WebSocketEvents } from '@proj-airi/server-sdk'

import { errorMessageFrom } from '@moeru/std'
import { rawTool } from '@xsai/tool'
import { toJsonSchema, validate } from 'xsschema'
import { z } from 'zod'

import {
  normalizeNullableAnyOf,
  sparkNotifyCommandItemSchema,
} from './spark-command-shared'

export interface SparkNotifyCommandDraft {
  destinations: string[]
  interrupt?: 'force' | 'soft' | boolean
  priority?: 'critical' | 'high' | 'normal' | 'low'
  intent?: 'plan' | 'proposal' | 'action' | 'pause' | 'resume' | 'reroute' | 'context'
  ack?: string
  guidance?: WebSocketEvents['spark:command']['guidance']
  contexts?: WebSocketEvents['spark:command']['contexts']
}

export const sparkNotifyCommandSchema = z.object({
  commands: z.array(sparkNotifyCommandItemSchema).describe('List of commands to issue to sub-agents, you may produce multiple commands in response to multiple sub-agents by specifying their IDs in destination field. Empty array can be used for zero commands.'),
}).strict()

export type SparkNotifyCommandSchema = z.infer<typeof sparkNotifyCommandSchema>

export interface CreateSparkNotifyToolsOptions {
  onCommands: (commands: SparkNotifyCommandDraft[]) => void
  onNoResponse: () => void
}

function normalizeSparkNotifyCommand(
  command: z.infer<typeof sparkNotifyCommandSchema>['commands'][number],
): SparkNotifyCommandDraft {
  // NOTICE: The notify-agent tool schema preserves the LLM-facing payload shape, but the
  // orchestrator stores runtime drafts in the websocket event shape. This normalizes array
  // persona entries and nullable guidance fields back into the draft shape expected downstream.
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

export async function createSparkNotifyTools(options: CreateSparkNotifyToolsOptions) {
  const sparkNoResponseTool = rawTool({
    name: 'builtIn_sparkNoResponse',
    description: 'Indicate that no response or action is needed for the current spark:notify event.',
    // NOTICE: Keep the same raw-tool + normalized-schema path as the general spark command
    // tool so built-in notify tools do not regress on the same provider-specific schema checks.
    parameters: normalizeNullableAnyOf(await toJsonSchema(z.object({}).strict()) as any),
    execute: async () => {
      options.onNoResponse()
      return 'AIRI System: Acknowledged, no response or action will be processed.'
    },
  })

  const sparkCommandTool = rawTool({
    name: 'builtIn_sparkCommand',
    description: 'Issue a spark:command to sub-agents. You can call this tool multiple times to issue matrices of commands to different sub-agents as needed.',
    // NOTICE: `sparkNotifyCommandSchema` keeps the notify-agent input shape, but its emitted
    // JSON Schema still passes through the shared nullable-union normalizer before rawTool
    // freezes it for OpenAI-compatible providers.
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
  })

  return {
    tools: [
      sparkNoResponseTool,
      sparkCommandTool,
    ],
  }
}
