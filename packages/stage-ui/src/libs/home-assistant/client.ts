import type { InferOutput } from 'valibot'

import * as v from 'valibot'

/** One entity as Home Assistant reports it in `/api/states`. */
export interface HomeAssistantEntity {
  entityId: string
  state: string
  attributes: Record<string, unknown>
  /** When the state last changed, as an ISO timestamp. */
  lastChanged?: string
}

/** One service call, addressed by domain and service. */
export interface HomeAssistantServiceCall {
  /** Service domain, such as `light` or `climate`. */
  domain: string
  /** Service name, such as `turn_on`. */
  service: string
  /** Target entity. Omit when the service targets a whole domain. */
  entityId?: string
  /** Extra service fields, such as `brightness`. */
  data?: Record<string, unknown>
}

/**
 * Performs one authenticated request against Home Assistant.
 *
 * Each runtime implements this seam. The browser fetches directly, Electron asks
 * its main process, and the mobile application uses the native HTTP plugin. The
 * client below owns paths, payload shapes, and validation for all of them.
 */
export type HomeAssistantTransport = (input: {
  path: string
  method: 'GET' | 'POST'
  body?: unknown
  signal?: AbortSignal
}) => Promise<unknown>

/** Home Assistant could not serve the request. */
export class HomeAssistantError extends Error {
  /** Response status when the failure came from a response. */
  readonly status?: number

  constructor(message: string, options?: { cause?: unknown, status?: number }) {
    super(message, options)
    this.name = 'HomeAssistantError'
    this.status = options?.status
  }
}

const entitySchema = v.object({
  entity_id: v.string(),
  state: v.string(),
  attributes: v.optional(v.record(v.string(), v.unknown()), {}),
  last_changed: v.optional(v.string()),
})

const stateListSchema = v.array(entitySchema)

/** Home Assistant entity ids are `<domain>.<object_id>` in lower case. */
const serviceSlugPattern = /^[a-z0-9_]+$/

/** Entity ids add one dot between the domain and the object id. */
const entityIdPattern = /^[a-z0-9_]+\.[a-z0-9_]+$/

/**
 * Reads the domain from an entity id.
 *
 * Home Assistant writes every entity id as `<domain>.<object_id>`. A value
 * without a dot is not a valid entity id, so it returns unchanged and the
 * caller's validation decides what happens.
 */
export function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

function toEntity(entity: InferOutput<typeof entitySchema>): HomeAssistantEntity {
  return {
    entityId: entity.entity_id,
    state: entity.state,
    attributes: entity.attributes,
    ...(entity.last_changed ? { lastChanged: entity.last_changed } : {}),
  }
}

function assertSlug(value: string, label: string) {
  if (!serviceSlugPattern.test(value))
    throw new HomeAssistantError(`"${value}" is not a valid Home Assistant ${label}.`)
}

/**
 * Builds the Home Assistant client over one transport.
 *
 * Callers provide the base URL and the access token in their transport, so this
 * client never handles credentials. Responses are validated, because they arrive
 * from a server the user configures rather than from this application.
 */
export function createHomeAssistantClient(transport: HomeAssistantTransport) {
  async function listEntities(signal?: AbortSignal): Promise<HomeAssistantEntity[]> {
    const raw = await transport({ path: '/api/states', method: 'GET', signal })
    const parsed = v.safeParse(stateListSchema, raw)
    if (!parsed.success)
      throw new HomeAssistantError('Home Assistant returned an unexpected state list.', { cause: parsed.issues })

    return parsed.output.map(toEntity)
  }

  async function callService(call: HomeAssistantServiceCall, signal?: AbortSignal): Promise<unknown> {
    assertSlug(call.domain, 'service domain')
    assertSlug(call.service, 'service name')

    // `entity_id` sits in the body, not the path, so it needs no escaping. The
    // path segments are escaped because a caller can pass any string here.
    const body: Record<string, unknown> = { ...call.data }
    if (call.entityId)
      body.entity_id = call.entityId

    return await transport({
      path: `/api/services/${encodeURIComponent(call.domain)}/${encodeURIComponent(call.service)}`,
      method: 'POST',
      body,
      signal,
    })
  }

  async function getState(entityId: string, signal?: AbortSignal): Promise<HomeAssistantEntity> {
    // Home Assistant declares entity ids as `<domain>.<object_id>`. Keeping the
    // dot makes the slug check unusable, so this rejects only the characters that
    // would change the request path.
    if (!entityIdPattern.test(entityId))
      throw new HomeAssistantError(`"${entityId}" is not a valid Home Assistant entity id.`)

    const raw = await transport({ path: `/api/states/${encodeURIComponent(entityId)}`, method: 'GET', signal })
    const parsed = v.safeParse(entitySchema, raw)
    if (!parsed.success)
      throw new HomeAssistantError(`Home Assistant returned an unexpected state for "${entityId}".`, { cause: parsed.issues })

    return toEntity(parsed.output)
  }

  return {
    callService,
    getState,
    listEntities,
  }
}

/** The client that the tools and the settings page share. */
export type HomeAssistantClient = ReturnType<typeof createHomeAssistantClient>
