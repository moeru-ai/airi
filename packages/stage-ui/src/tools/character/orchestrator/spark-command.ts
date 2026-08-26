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
      description: 'Send a spark:command to one or more frontend-connected modules or sub-agents.',
      execute: async (rawPayload) => {
        const payload = rawPayload as z.infer<typeof sparkCommandToolSchema>
        const command = {
          ack: payload.ack ?? undefined,
          commandId: nanoid(),
          contexts: payload.contexts?.map(context => ({
            contextId: nanoid(),
            destinations: normalizeSparkCommandDestinations(context.destinations),
            hints: normalizeSparkCommandStringList(context.hints),
            id: nanoid(),
            ideas: normalizeSparkCommandStringList(context.ideas),
            lane: normalizeSparkCommandStringValue(context.lane),
            metadata: normalizeSparkCommandMetadata(context.metadata ?? undefined),
            strategy: context.strategy,
            text: context.text,
          })),
          destinations: payload.destinations,
          eventId: nanoid(),
          guidance: payload.guidance
            ? {
                options: normalizeSparkCommandGuidanceOptions(payload.guidance.options),
                persona: normalizeSparkCommandPersona(payload.guidance.persona ?? undefined),
                type: payload.guidance.type,
              }
            : undefined,
          id: nanoid(),
          intent: payload.intent ?? 'action',
          interrupt: payload.interrupt ?? false,
          parentEventId: payload.parentEventId ?? undefined,
          priority: payload.priority ?? 'normal',
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
      name: 'builtIn_emitSparkCommand',
      parameters,
    }),
  ]
}
