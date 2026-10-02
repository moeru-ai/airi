import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type z from 'zod/v4'

import { rawTool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { toJsonSchema } from 'xsschema'

import {
  normalizeSparkCommandDestinations,
  normalizeSparkCommandGuidanceOptions,
  normalizeSparkCommandMetadata,
  normalizeSparkCommandPersona,
  normalizeSparkCommandStringList,
  normalizeSparkCommandStringValue,
  sparkCommandToolSchema,
} from './schema'

/** Toolset guidance for requests that grant the Spark command relay. Module observations supply current targets and availability. */
export const SPARK_COMMAND_TOOLSET_PROMPT = [
  'Use builtIn_emitSparkCommand to relay instructions to a connected module.',
  'Use the destination declared by the module. Do not invent a target.',
  'If the user requests an action, set intent to "action".',
  'Set guidance.type to "instruction".',
  'Put the instruction summary in guidance.options[0].label.',
  'Put concrete action steps in guidance.options[0].steps.',
  'If the module reports that its relay is unavailable, do not send an action.',
  'If the tool reports a rejection, tell the user that the instruction was not sent.',
  'Do not claim that an instruction was relayed before the tool call succeeds.',
  'Tool success confirms submission. It does not confirm that the target completed the action.',
].join('\n')

/** Options for the Spark Command LLM tool. */
export interface CreateSparkCommandToolOptions {
  /**
   * Receives a protocol-ready `spark:command` event. Return `{ rejected }` when admission refuses it.
   * The model then reads the reason instead of a success.
   */
  sendSparkCommand: (command: WebSocketEvents['spark:command']) => void | { rejected: string }
}

/**
 * Creates the LLM tool that emits one `spark:command` event.
 *
 * The caller owns transport delivery. This function creates provider-facing schemas,
 * normalizes the tool payload, and passes the resulting event to `sendSparkCommand`.
 */
export async function createSparkCommandTool(options: CreateSparkCommandToolOptions) {
  // Keep the generated JSON Schema provider-neutral. Each provider adapter
  // converts unsupported schema forms before it sends the request.
  const parameters = await toJsonSchema(sparkCommandToolSchema)

  return [
    rawTool({
      name: 'builtIn_emitSparkCommand',
      description: 'Send a spark:command to one or more frontend-connected modules or sub-agents.',
      parameters,
      execute: async (rawPayload) => {
        const payload = rawPayload as z.infer<typeof sparkCommandToolSchema>
        const command = {
          id: nanoid(),
          eventId: nanoid(),
          parentEventId: payload.parentEventId ?? undefined,
          commandId: nanoid(),
          interrupt: payload.interrupt ?? false,
          priority: payload.priority ?? 'normal',
          intent: payload.intent ?? 'action',
          ack: payload.ack ?? undefined,
          guidance: payload.guidance
            ? {
                type: payload.guidance.type,
                persona: normalizeSparkCommandPersona(payload.guidance.persona ?? undefined),
                options: normalizeSparkCommandGuidanceOptions(payload.guidance.options),
              }
            : undefined,
          contexts: payload.contexts?.map(context => ({
            id: nanoid(),
            contextId: context.strategy === 'append-self' ? 'events' : nanoid(),
            lane: normalizeSparkCommandStringValue(context.lane),
            ideas: normalizeSparkCommandStringList(context.ideas),
            hints: normalizeSparkCommandStringList(context.hints),
            strategy: context.strategy,
            text: context.text,
            destinations: normalizeSparkCommandDestinations(context.destinations),
            metadata: normalizeSparkCommandMetadata(context.metadata ?? undefined),
          })),
          destinations: payload.destinations,
        } satisfies WebSocketEvents['spark:command']

        const delivery = options.sendSparkCommand(command)
        if (delivery?.rejected)
          return `spark:command rejected: ${delivery.rejected}`

        return `spark:command sent (${command.commandId}) to ${command.destinations.join(', ')}`
      },
    }),
  ]
}
