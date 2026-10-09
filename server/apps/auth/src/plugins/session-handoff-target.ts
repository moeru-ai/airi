/**
 * Accepts only a same-origin OAuth authorize URL as the handoff destination.
 *
 * The session token arrives in the query of a top-level navigation. The next
 * hop must stay on this auth server's authorize route so the freshly set
 * cookie is what the mobile browser sends, and so the token cannot be used
 * as an open redirect.
 */
export function authorizeHandoffTarget(next: string, baseURL: string): string | null {
  let target: URL
  let base: URL
  try {
    base = new URL(baseURL)
    target = new URL(next, base)
  }
  catch {
    return null
  }
  if (target.origin !== base.origin)
    return null
  if (target.username || target.password || target.hash)
    return null
  if (target.pathname !== '/api/auth/oauth2/authorize')
    return null
  if (!target.searchParams.get('client_id') || target.searchParams.get('response_type') !== 'code')
    return null
  return target.toString()
}
