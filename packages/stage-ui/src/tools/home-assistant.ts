import type { Tool } from '@xsai/shared-chat'

import type { HomeAssistantClient, HomeAssistantEntity } from '../libs/home-assistant/client'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

/**
 * Default cap on the entity list one lookup returns.
 *
 * A large Home Assistant install reports thousands of entities. Sending all of
 * them would fill the context with rows the model cannot use.
 */
const DEFAULT_ENTITY_LIMIT = 60

/** Inclusive bounds for that cap. */
const MIN_ENTITY_LIMIT = 1
const MAX_ENTITY_LIMIT = 200

/** Builds the compact row the model reads when it picks a target. */
function toSummary(entity: HomeAssistantEntity) {
  const name = entity.attributes.friendly_name
  return {
    entityId: entity.entityId,
    state: entity.state,
    ...(typeof name === 'string' && name ? { name } : {}),
  }
}

/**
 * Rejects a service payload that is not a flat JSON object.
 *
 * The payload crosses into the main process and lands in a request body, so a
 * nested or non-object value is a caller mistake rather than something to send.
 */
function parseServiceData(raw: string | undefined) {
  if (!raw?.trim())
    return undefined

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  }
  catch (error) {
    throw new Error(`data is not valid JSON: ${errorMessageFrom(error) ?? 'unknown parse error'}`)
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    throw new Error('data must be a JSON object, for example {"brightness": 200}.')

  return parsed as Record<string, unknown>
}

/**
 * Extracts state changes from a service call response.
 *
 * Home Assistant answers a service call with the states it changed. Anything
 * else means the call is complete but reports no state change.
 */
function parseServiceResponse(response: unknown) {
  if (!Array.isArray(response))
    return []

  return response.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null)
      return []
    const candidate = entry as Partial<HomeAssistantEntity> & { entity_id?: unknown, state?: unknown }
    return typeof candidate.entity_id === 'string' && typeof candidate.state === 'string'
      ? [{ entityId: candidate.entity_id, state: candidate.state }]
      : []
  })
}

/**
 * Builds the Home Assistant tools over one client.
 *
 * Use when:
 * - A runtime owns a Home Assistant transport and exposes it to the model
 *
 * Expects:
 * - `client` reaches Home Assistant with a base URL and a token that this
 *   function never sees
 *
 * Returns:
 * - Three tools that read entities, read one state, and call one service
 */
export async function createHomeAssistantTools(
  client: HomeAssistantClient,
  options: { entityLimit?: number } = {},
): Promise<Tool[]> {
  const entityLimit = Math.min(
    MAX_ENTITY_LIMIT,
    Math.max(MIN_ENTITY_LIMIT, options.entityLimit ?? DEFAULT_ENTITY_LIMIT),
  )

  // `tool()` converts the Zod schema to JSON Schema asynchronously, so it
  // resolves to the tool rather than returning one.
  return await Promise.all([
    tool({
      name: 'home_assistant_list_entities',
      description: 'List Home Assistant entities and their current states. Call this first to find the entity_id for a device the user named (match by the "name" field). Pass a domain like "light" or "climate" to filter. Results are capped; use domain filtering on large installations.',
      execute: async ({ domain }) => {
        const entities = await client.listEntities()
        const matching = domain ? entities.filter(entity => entity.entityId.startsWith(`${domain}.`)) : entities
        const capped = matching.slice(0, entityLimit)

        return JSON.stringify({
          count: capped.length,
          total: matching.length,
          ...(capped.length < matching.length ? { note: `Only the first ${capped.length} of ${matching.length} entities are shown. Pass a domain to narrow the list.` } : {}),
          entities: capped.map(toSummary),
        })
      },
      parameters: z.object({
        domain: z.string().optional().describe('Entity domain to filter by, for example "light" or "climate".'),
      }).strict(),
    }),
    tool({
      name: 'home_assistant_get_state',
      description: 'Read the current state and attributes of one Home Assistant entity. Use this to answer questions about a device or check a value before changing it.',
      execute: async ({ entity_id: entityId }) => {
        const entity = await client.getState(entityId)
        return JSON.stringify({ ...toSummary(entity), attributes: entity.attributes })
      },
      parameters: z.object({
        entity_id: z.string().describe('Entity id, for example "light.living_room".'),
      }).strict(),
    }),
    tool({
      name: 'home_assistant_call_service',
      description: 'Call a Home Assistant service to control devices (turn on/off, set brightness, change temperature). Always list entities first to find the correct entity_id. Report the returned state changes to the user.',
      execute: async ({ domain, service, entity_id: entityId, data }) => {
        const response = await client.callService({
          domain,
          service,
          entityId,
          data: parseServiceData(data),
        })

        return JSON.stringify({ changed: parseServiceResponse(response) })
      },
      parameters: z.object({
        domain: z.string().describe('Service domain, for example "light".'),
        service: z.string().describe('Service name, for example "turn_on".'),
        entity_id: z.string().optional().describe('Target entity id. Omit it when the service targets a whole domain.'),
        // NOTICE: `data` is z.string() (JSON) because z.record() emits `propertyNames`,
        // which OpenAI rejects. The same reason appears beside builtIn_mcpCallTool.
        data: z.string().optional().describe('Extra service fields as a JSON object string, for example {"brightness": 200}.'),
      }).strict(),
    }),
  ])
}
