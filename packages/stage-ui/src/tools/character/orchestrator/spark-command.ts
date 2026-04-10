import type { WebSocketEvents } from '@proj-airi/server-sdk'
import type z from 'zod/v4'

import { rawTool } from '@xsai/tool'
import { nanoid } from 'nanoid'
import { toJsonSchema } from 'xsschema'

import {
  normalizeNullableAnyOf,
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
  // NOTICE: We intentionally bypass `tool(...)` here so we can normalize the generated
  // JSON Schema before `strictJsonSchema(...)` finalizes it. This is required for providers
  // like Azure that reject some `anyOf` nullable forms and strict-object optional-field shapes.
  const parameters = normalizeNullableAnyOf(await toJsonSchema(sparkCommandToolSchema) as any)

  return rawTool({
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

      return `spark:command sent (${command.commandId}) to ${command.destinations.join(', ')}`
    },
  })
}
