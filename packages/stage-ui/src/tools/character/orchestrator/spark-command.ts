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
} from './spark-command-shared'

export interface CreateSparkCommandToolOptions {
  sendSparkCommand: (command: WebSocketEvents['spark:command']) => void
}

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
            contextId: nanoid(),
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

        options.sendSparkCommand(command)

        // `destinations` may be undefined: the channel sender (stores/ai/chat-llm/llm.ts sendSparkCommand) deletes
        // it to trigger broadcast-to-all-authenticated-peers. Guard the .join so we don't surface
        // "Cannot read properties of undefined (reading 'join')" back to the LLM after a successful send.
        const dests = Array.isArray(command.destinations) && command.destinations.length > 0
          ? command.destinations.join(', ')
          : 'all authenticated peers (broadcast)'
        return `spark:command sent (${command.commandId}) to ${dests}`
      },
    }),
  ]
}
