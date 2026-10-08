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
