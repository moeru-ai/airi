import type { Tool } from '@xsai/shared-chat'

import type { HomeAssistantClient, HomeAssistantEntity } from '../libs/home-assistant/client'
import type { HomeAssistantExposure } from '../libs/home-assistant/exposure'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { domainOf } from '../libs/home-assistant/client'
import { allEntitiesExposure, assertEntityExposed, describeExposure, describeHidden, filterExposed } from '../libs/home-assistant/exposure'
import { assertServiceAllowed, isGroupEntity } from '../libs/home-assistant/services'

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
 * The exposure policy is applied here, not in the client. The model reaches Home
 * Assistant only through these tools, so this is where a blocked device stays
 * out of reach and where a blocked call returns a message the model can act on.
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
  options: { entityLimit?: number, exposure?: HomeAssistantExposure } = {},
): Promise<Tool[]> {
  const entityLimit = Math.min(
    MAX_ENTITY_LIMIT,
    Math.max(MIN_ENTITY_LIMIT, options.entityLimit ?? DEFAULT_ENTITY_LIMIT),
  )
  const exposure = options.exposure ?? allEntitiesExposure
  // Each description states the policy, because the model plans from the tool
  // list alone. A hidden domain would otherwise cost a failed call to discover.
  const policy = describeExposure(exposure)

  // `tool()` converts the Zod schema to JSON Schema asynchronously, so it
  // resolves to the tool rather than returning one.
  return await Promise.all([
    tool({
      name: 'home_assistant_list_entities',
      description: `List Home Assistant entities and their current states. Call this first to find the entity_id for a device the user named (match by the "name" field). Pass a domain like "light" or "climate" to browse one kind of device. Results are capped, so pass a domain on a large installation. ${policy}`,
      execute: async ({ domain }) => {
        const entities = await client.listEntities()
        // The domain is a way to browse, not a permission. A domain the user
        // blocked returns the rows it still holds, which can be none.
        const scoped = domain ? entities.filter(entity => domainOf(entity.entityId) === domain) : entities
        const visible = filterExposed(exposure, scoped)
        const capped = visible.slice(0, entityLimit)
        // A blocked device must not appear, but the count must. The count covers
        // the rows this call could have returned, so a domain that holds only
        // blocked devices does not read as a domain that holds nothing.
        const hidden = describeHidden(exposure, scoped.length - visible.length)

        const notes = [
          ...(capped.length < visible.length ? [`Only the first ${capped.length} of ${visible.length} entities are shown. Pass a domain to narrow the list.`] : []),
          ...(hidden ? [hidden] : []),
        ]

        return JSON.stringify({
          count: capped.length,
          total: visible.length,
          ...(notes.length ? { note: notes.join(' ') } : {}),
          entities: capped.map(toSummary),
        })
      },
      parameters: z.object({
        domain: z.string().optional().describe('Entity domain to filter by, for example "light" or "climate".'),
      }).strict(),
    }),
    tool({
      name: 'home_assistant_get_state',
      description: `Read the current state and attributes of one Home Assistant entity. Use this to answer questions about a device or check a value before changing it. ${policy}`,
      execute: async ({ entity_id: entityId }) => {
        assertEntityExposed(exposure, entityId)

        const entity = await client.getState(entityId)
        return JSON.stringify({ ...toSummary(entity), attributes: entity.attributes })
      },
      parameters: z.object({
        entity_id: z.string().describe('Entity id, for example "light.living_room".'),
      }).strict(),
    }),
    tool({
      name: 'home_assistant_call_service',
      description: `Call a Home Assistant service to control one device (turn on/off, set brightness, change temperature). Always list entities first to find the correct entity_id, then pass exactly one. Use the service of the device domain, for example light.turn_on for a light, or homeassistant.turn_on for any device. Report the returned state changes to the user. ${policy}`,
      execute: async ({ domain, service, entity_id: entityId, data }) => {
        assertEntityExposed(exposure, entityId)
        // A service that is its own target, such as a script named as the
        // service, would run what the user never allowed. The list holds the
        // services that act on the entity the caller named.
        assertServiceAllowed(domain, service)

        // A service on a group reaches every member. Read the target first, so a
        // call cannot change a device this check never saw. A target Home
        // Assistant cannot report fails the call, because nothing can be
        // checked without it.
        const target = await client.getState(entityId)
        if (isGroupEntity(target.attributes))
          throw new Error(`Entity "${entityId}" is a group of other devices. A service on it changes every member. Ask the user for one device by name, or list the entities and call the service on the member you need.`)

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
        // Required on purpose. A call with no target reaches a whole domain at
        // once, which is a larger action than the user asked for and one the
        // exposure policy cannot check. The model calls the service per entity.
        entity_id: z.string().describe('Target entity id, for example "light.living_room". Always pass one.'),
        // NOTICE: `data` is z.string() (JSON) because z.record() emits `propertyNames`,
        // which OpenAI rejects. The same reason appears beside builtIn_mcpCallTool.
        data: z.string().optional().describe('Extra service fields as a JSON object string, for example {"brightness": 200}.'),
      }).strict(),
    }),
  ])
}
