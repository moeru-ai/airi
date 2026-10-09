/**
 * Chooses where the browser goes after a successful email sign-in.
 *
 * Same-site deployments can follow the authorize URL directly because the
 * sign-in response's session cookie is kept. Cross-site deployments (the
 * server-dev auth UI on pages.dev calling the Railway API) must take a
 * top-level hop through the API so the cookie is set in a first-party response.
 */
export function emailSignInNavigationURL(args: {
  pageOrigin: string
  apiServerUrl: string
  token: string | null
  redirectURL: string | null
  callbackURL: string
}): string {
  const destination = args.redirectURL ?? args.callbackURL
  if (!args.token)
    return destination

  let apiOrigin: string
  try {
    apiOrigin = new URL(args.apiServerUrl).origin
  }
  catch {
    return destination
  }
  if (args.pageOrigin === apiOrigin)
    return destination

  const handoff = new URL('/api/auth/session-handoff', apiOrigin)
  handoff.searchParams.set('token', args.token)
  handoff.searchParams.set('next', destination)
  return handoff.toString()
}
