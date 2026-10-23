import type { Tool } from '@xsai/shared-chat'

import type { HomeAssistantClient, HomeAssistantEntity } from '../libs/home-assistant/client'
import type { HomeAssistantExposure } from '../libs/home-assistant/exposure'

import { errorMessageFrom } from '@moeru/std'
import { tool } from '@xsai/tool'
import { z } from 'zod'

import { domainOf } from '../libs/home-assistant/client'
import { allEntitiesExposure, assertEntityExposed, describeExposure, describeHidden, filterExposed } from '../libs/home-assistant/exposure'
import { assertServiceAllowed, isGroupEntity } from '../libs/home-assistant/services'

/** The names of the Home Assistant tools. The chat shows the devices in their results as device rows. */
export const HOME_ASSISTANT_TOOL_NAMES = {
  listEntities: 'home_assistant_list_entities',
  getState: 'home_assistant_get_state',
  callService: 'home_assistant_call_service',
} as const

/**
 * Default cap on the entity list one lookup returns.
 *
 * A large Home Assistant install reports thousands of entities. Sending all of
 * them fills the context with rows the model cannot use.
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
function parseServiceData(raw: string | null | undefined) {
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
  options: {
    entityLimit?: number
    exposure?: () => HomeAssistantExposure
    /**
     * Reads the address the tools act on.
     *
     * A call that reads a device and then changes it pins the address it read,
     * so the transport can refuse a request whose instance moved in between.
     */
    readInstance?: () => Promise<string>
  } = {},
): Promise<Tool[]> {
  const entityLimit = Math.min(
    MAX_ENTITY_LIMIT,
    Math.max(MIN_ENTITY_LIMIT, options.entityLimit ?? DEFAULT_ENTITY_LIMIT),
  )
  // The policy is read at the moment of each call. The settings page can change
  // the list while a model request runs, and that request already holds these
  // executors, so a captured value lets it reach a device the user blocked
  // a moment ago.
  const readExposure = () => options.exposure?.() ?? allEntitiesExposure
  /** The instance the next request reaches, so a request can pin it. */
  const readInstance = async () => options.readInstance ? await options.readInstance() : undefined

  /**
   * Refuses an answer that describes an instance the user left.
   *
   * A request pins the instance it reaches, and the main process answers with
   * that instance's data. The address can move during the request, and the answer
   * then describes an instance the user left, while the policy below describes
   * the one the user holds. The address is read again here to tell the two apart.
   */
  async function assertInstanceHeld(instance: string | undefined) {
    if (instance === undefined || !options.readInstance)
      return
    if (await options.readInstance() !== instance)
      throw new Error('The Home Assistant address changed during the request. The answer describes an instance the user left. Ask again.')
  }

  // Each description states the policy, because the model plans from the tool
  // list alone. A hidden domain otherwise costs a failed call to discover.
  const policy = describeExposure(readExposure())

  // `tool()` converts the Zod schema to JSON Schema asynchronously, so it
  // resolves to the tool rather than returning one.
  return await Promise.all([
    tool({
      name: HOME_ASSISTANT_TOOL_NAMES.listEntities,
      description: `List Home Assistant entities and their current states. Call this first to find the entity_id for a device the user named (match by the "name" field). Pass a domain like "light" or "climate" to browse one kind of device. Results are capped, so pass a domain on a large installation. ${policy}`,
      execute: async ({ domain }) => {
        const instance = await readInstance()
        const entities = await client.listEntities(instance === undefined ? {} : { expectBaseUrl: instance })
        await assertInstanceHeld(instance)
        // The listing takes a round trip, and the user can change the policy
        // during it. The policy is read after the response, so the rows and the
        // count of hidden rows both describe the list the user holds now.
        const exposure = readExposure()
        // The domain is a way to browse, not a permission. A domain the user
        // blocked returns the rows it still holds, which can be none.
        const scoped = domain ? entities.filter(entity => domainOf(entity.entityId) === domain) : entities
        const visible = filterExposed(exposure, scoped)
        const capped = visible.slice(0, entityLimit)
        // A blocked device must not appear, but the count must. The count covers
        // the rows this call returns, so a domain that holds only
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
        // Optional inputs are required-nullable, not `.optional()`. OpenAI strict
        // mode wants every property in `required`, or the whole request fails.
        domain: z.union([z.string(), z.null()]).describe('Entity domain to filter by, for example "light" or "climate", or null for every domain.'),
      }).strict(),
    }),
    tool({
      name: HOME_ASSISTANT_TOOL_NAMES.getState,
      description: `Read the current state and attributes of one Home Assistant entity. Use this to answer questions about a device or check a value before changing it. ${policy}`,
      execute: async ({ entity_id: entityId }) => {
        assertEntityExposed(readExposure(), entityId)

        const instance = await readInstance()
        const entity = await client.getState(entityId, instance === undefined ? {} : { expectBaseUrl: instance })
        await assertInstanceHeld(instance)

        // The read takes a round trip, and the user can block the device during
        // it. The policy is read again, so a state the user just took away does
        // not reach the model.
        assertEntityExposed(readExposure(), entityId)

        return JSON.stringify({ ...toSummary(entity), attributes: entity.attributes })
      },
      parameters: z.object({
        entity_id: z.string().describe('Entity id, for example "light.living_room".'),
      }).strict(),
    }),
    tool({
      name: HOME_ASSISTANT_TOOL_NAMES.callService,
      description: `Call a Home Assistant service to control one device (turn on/off, set brightness, change temperature). Always list entities first to find the correct entity_id, then pass exactly one. Use the service of the device domain, for example light.turn_on for a light, or homeassistant.turn_on for any device. Report the returned state changes to the user. ${policy}`,
      execute: async ({ domain, service, entity_id: entityId, data }) => {
        // A service that is its own target, such as a script named as the
        // service, runs what the user never allowed. The list holds the
        // services that act on the entity the caller named.
        assertServiceAllowed(domain, service)

        // Fail before the reads below, so a blocked device costs no request.
        assertEntityExposed(readExposure(), entityId)

        // The instance this call will reach, so the request can be pinned to it.
        const instance = await readInstance()

        // A service on a group reaches every member, so the target is read
        // first, and a target Home Assistant cannot report fails the call.
        // The read pins the instance the call will reach, or the address can
        // move during it and the guard checks one instance and acts on another.
        const target = await client.getState(entityId, instance === undefined ? {} : { expectBaseUrl: instance })
        if (isGroupEntity(entityId, target.attributes))
          throw new Error(`Entity "${entityId}" is a group of other devices. A service on it changes every member. Ask the user for one device by name, or list the entities and call the service on the member you need.`)

        // The policy is read after every await, so a user who blocks the device
        // while the reads above are in flight loses the call.
        assertEntityExposed(readExposure(), entityId)

        const response = await client.callService(
          { domain, service, entityId, data: parseServiceData(data) },
          instance === undefined ? {} : { expectBaseUrl: instance },
        )
        // The states in the answer belong to the instance the call reached. A
        // move during the call makes the policy below describe another instance,
        // and a blocked device of the old one reaches the model through it.
        await assertInstanceHeld(instance)

        // A scene, a script, or an automation changes other devices too, and
        // Home Assistant reports every state it changed. The policy is read once
        // more here, so an allowed device cannot answer with the state of one the
        // user blocked.
        const changed = parseServiceResponse(response)
        const exposed = filterExposed(readExposure(), changed)
        const hidden = changed.length - exposed.length

        return JSON.stringify({
          changed: exposed,
          ...(hidden
            ? { note: `${hidden} further device${hidden === 1 ? '' : 's'} changed, hidden by the user's policy.` }
            : {}),
        })
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
        // Required-nullable for OpenAI strict mode, as with `domain` above.
        data: z.union([z.string(), z.null()]).describe('Extra service fields as a JSON object string, for example {"brightness": 200}, or null for none.'),
      }).strict(),
    }),
  ])
}
