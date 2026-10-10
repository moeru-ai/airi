/**
 * Request rules for the Home Assistant service.
 *
 * These functions hold no Electron state, so they stay testable on their own.
 * The service in `./index` applies them around the stored address and token.
 */

/**
 * How long one Home Assistant request may take.
 *
 * A renderer tool call waits on this response, so an instance that stopped
 * answering must fail the call instead of holding the turn open.
 */
export const requestTimeoutMs = 15_000

/** Home Assistant serves its API under this prefix. */
export const apiPathPrefix = '/api/'

/** Trims a user-entered base URL and rejects a scheme this process cannot fetch. */
export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '')
  if (!trimmed)
    return ''

  let parsed: URL
  try {
    parsed = new URL(trimmed)
  }
  catch {
    throw new Error(`"${value}" is not a valid URL.`)
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    throw new Error('The Home Assistant address must start with http:// or https://.')

  return trimmed
}

/**
 * Rejects a path that would leave the Home Assistant API surface.
 *
 * Percent escapes stay out on purpose. The URL parser decodes `%2e%2e` into a
 * parent segment, so a path that reads as `/api/…` would resolve outside it.
 * Every path the client builds matches `[a-z0-9_.]`, which means a `%` comes
 * from a caller that is not the client.
 */
export function assertApiPath(path: string): void {
  if (!path.startsWith(apiPathPrefix) || path.includes('..') || path.includes('//') || path.includes('%') || /\s/.test(path))
    throw new Error(`A Home Assistant request path must start with ${apiPathPrefix}, received "${path}".`)
}

/**
 * Builds the URL for one request, and checks it again after normalization.
 *
 * The text check in {@link assertApiPath} reads the path as written. This one
 * reads the path the request will use, which is the value that decides where the
 * request lands. A base URL under a subpath keeps that subpath, because a
 * reverse proxy can serve Home Assistant there.
 */
export function resolveRequestUrl(baseUrl: string, path: string): URL {
  assertApiPath(path)

  const target = new URL(`${baseUrl}${path}`)
  const basePath = new URL(baseUrl).pathname.replace(/\/+$/, '')
  if (!target.pathname.startsWith(`${basePath}${apiPathPrefix}`))
    throw new Error(`A Home Assistant request path must start with ${basePath}${apiPathPrefix}, resolved "${target.pathname}".`)

  return target
}

/**
 * Builds the mask that the settings page shows in place of the stored token.
 *
 * The last four characters stay, so a user can tell which token is stored. The
 * rest becomes dots, so the page never holds a usable secret.
 */
export function toTokenPreview(token: string): string {
  if (!token)
    return ''

  const tail = token.slice(-4)
  return `${'•'.repeat(8)}${tail}`
}

/** Reads a response body that can be JSON, text, or empty. */export async function readBody(response: Response): Promise<unknown> {
  const text = await response.text()
  if (!text)
    return undefined

  try {
    return JSON.parse(text)
  }
  catch {
    return text
  }
}

/** Turns a failed response into a message the model can act on. */
export async function toRequestError(response: Response): Promise<Error> {
  const body = await readBody(response)
  const detail = typeof body === 'string'
    ? body
    : typeof body === 'object' && body !== null && 'message' in body && typeof body.message === 'string'
      ? body.message
      : ''

  if (response.status === 401)
    return new Error(`Home Assistant rejected the access token (401). ${detail}`.trim())

  return new Error(`Home Assistant answered ${response.status} ${response.statusText}. ${detail}`.trim())
}

/**
 * Reports whether one path is a service call, which names its target in the body.
 *
 * The main process reads that target under the same configuration it will use
 * for the call, so a group cannot reach its members and an address change cannot
 * slip between the two requests.
 */
export function isServiceCall(method: string, path: string): boolean {
  return method === 'POST' && /^\/api\/services\/[a-z0-9_]+\/[a-z0-9_]+$/.test(path)
}

/**
 * Reads the target a service call names.
 *
 * The client builds the body and always sets `entity_id`. A call without one
 * reaches a whole domain at once, so a body that names no device is refused
 * rather than forwarded.
 */
export function readServiceTarget(body: unknown): string {
  const entityId = (body as { entity_id?: unknown } | null | undefined)?.entity_id
  if (typeof entityId !== 'string' || !entityId)
    throw new Error('A Home Assistant service call must name one entity_id. Nothing was sent.')

  return entityId
}

/** One attribute Home Assistant adds to an entity that stands for several others. */
const memberAttribute = 'entity_id'

/** Reads the domain from an entity id, which Home Assistant writes as `<domain>.<object_id>`. */
function domainOf(entityId: string): string {
  return entityId.split('.')[0] ?? ''
}

/**
 * Reports whether a service target stands for several devices.
 *
 * A group carries its members in its own attributes, and a service call on the
 * group reaches every member. A scene carries the same attribute, and it is the
 * exception: a scene is one device the user allows, so its effect is what the
 * user allowed with it.
 */
export function isCompositeTarget(entityId: string, state: unknown): boolean {
  if (domainOf(entityId) === 'scene')
    return false

  const attributes = (state as { attributes?: unknown } | null | undefined)?.attributes
  if (typeof attributes !== 'object' || attributes === null)
    return false

  const members = (attributes as Record<string, unknown>)[memberAttribute]
  return Array.isArray(members) && members.length > 0
}

/** Rejects a service call whose target stands for several devices. */
export function assertSingleTarget(entityId: string, state: unknown): void {
  if (!isCompositeTarget(entityId, state))
    return

  throw new Error(`Entity "${entityId}" is a group of other devices. A service on it changes every member. Ask the user for one device by name, or list the entities and call the service on the member you need.`)
}
