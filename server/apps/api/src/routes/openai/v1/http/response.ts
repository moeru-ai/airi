const SAFE_RESPONSE_HEADERS = new Set([
  'content-type',
  'content-length',
  'transfer-encoding',
  'cache-control',
])

const SAFE_ERROR_RESPONSE_HEADERS = new Set([
  'content-type',
  'retry-after',
])

export function buildSafeResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}

/**
 * Builds the headers for a final upstream error response.
 *
 * Upstream errors can expose useful body types and retry delays. Other
 * upstream headers can contain credentials, cookies, or provider internals.
 */
export function buildSafeErrorResponseHeaders(response: Response): Headers {
  const headers = new Headers()
  response.headers.forEach((value, key) => {
    if (SAFE_ERROR_RESPONSE_HEADERS.has(key.toLowerCase()))
      headers.set(key, value)
  })
  return headers
}
