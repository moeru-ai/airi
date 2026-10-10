import type { HomeAssistantConfigUpdate } from '../../../../shared/eventa/home-assistant'

import { homeAssistantConfigRejections } from '../../../../shared/eventa/home-assistant'

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

/** One stored Home Assistant setting: where it lives, and the secret to reach it. */
export interface HomeAssistantStoredConfig {
  baseUrl: string
  token: string
}

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
 * Applies one settings update to the stored configuration.
 *
 * A token belongs to one Home Assistant instance, so changing the address
 * requires the token for the new address. Keeping the old one across a move is
 * wrong for the user, and it is also the only way a renderer could send the
 * stored token to a server it controls: no update can move the address while
 * leaving the secret in place.
 *
 * An empty address clears both, so an accidental blank field cannot leave a
 * secret behind for a later address. An empty token clears the secret alone.
 */
export function resolveConfigUpdate(
  current: HomeAssistantStoredConfig,
  update: HomeAssistantConfigUpdate,
): HomeAssistantStoredConfig {
  const baseUrl = normalizeBaseUrl(update.baseUrl)
  if (!baseUrl)
    return { baseUrl: '', token: '' }

  const supplied = update.token?.trim() ?? ''
  if (supplied)
    return { baseUrl, token: supplied }

  // The shared contract documents an empty token as the clear operation, and an
  // absent token as the keep operation. The two differ, so the field is read
  // rather than coalesced.
  if (update.token !== undefined)
    return { baseUrl, token: '' }

  if (!current.token)
    throw new Error(homeAssistantConfigRejections.tokenRequired)

  if (baseUrl !== current.baseUrl)
    throw new Error(homeAssistantConfigRejections.addressChanged)

  return { baseUrl, token: current.token }
}

/**
 * The only request shapes the client builds.
 *
 * The renderer chooses the path, so this list decides what leaves the
 * application. Two shapes matter beyond the obvious ones: `POST /api/template`
 * runs arbitrary Jinja on the Home Assistant host, and `POST /api/states/{id}`
 * writes a state. The client produces neither, so neither is allowed.
 *
 * The patterns are strict enough to reject a percent escape, a `..` segment, a
 * doubled slash, and whitespace, because every segment the client builds
 * matches `[a-z0-9_.]`.
 */
const allowedRequests: Array<{ method: 'GET' | 'POST', pattern: RegExp }> = [
  { method: 'GET', pattern: /^\/api\/states$/ },
  { method: 'GET', pattern: /^\/api\/states\/[a-z0-9_]+\.[a-z0-9_]+$/ },
  { method: 'POST', pattern: /^\/api\/services\/[a-z0-9_]+\/[a-z0-9_]+$/ },
]

/** Rejects a request the client would never build. */
export function assertAllowedRequest(method: string, path: string): void {
  const allowed = allowedRequests.some(entry => entry.method === method && entry.pattern.test(path))
  if (!allowed)
    throw new Error(`Home Assistant accepts only the requests this client builds, received "${method} ${path}".`)
}

/**
 * Builds the URL for one request, and checks the resolved result too.
 *
 * {@link assertAllowedRequest} reads the path as written. This reads the path
 * the request will use, which is the value that decides where it lands. A base
 * URL under a subpath keeps that subpath, because a reverse proxy can serve
 * Home Assistant there.
 */
export function resolveRequestUrl(baseUrl: string, method: string, path: string): URL {
  assertAllowedRequest(method, path)

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

/** Reads a response body that can be JSON, text, or empty. */
export async function readBody(response: Response): Promise<unknown> {
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
