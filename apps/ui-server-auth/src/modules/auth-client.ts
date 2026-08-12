/**
 * Better-auth client factory for the auth-only SPA (`apps/ui-server-auth`).
 *
 * Separate from the stage-ui singleton because that client is Bearer-only:
 * it omits cookies and injects the auth-store token on every request, which
 * makes no sense on the page the session cookie was just set on. This client
 * uses better-auth's cookie defaults (`credentials: 'include'`) instead.
 *
 * Test seam: pass `fetchImpl` to substitute `globalThis.fetch` (wired as
 * `customFetchImpl`; see node_modules/better-auth/dist/client/config.mjs L+
 * — the `restOfFetchOptions` spread happens after the default, so a
 * user-supplied value wins). With `fetchImpl` we don't memoise, so tests
 * can't leak state between cases; production callers memoise per
 * `apiServerUrl`.
 *
 * Removal condition: better-auth ships a hosted typed client for OIDC IdP
 * setups where one process is both IdP and resource server. Until then,
 * one factory per credential mode is the cleanest contract.
 */

import { steamClient } from '@proj-airi/stage-ui/libs/steam-auth-client'
import { createAuthClient } from 'better-auth/vue'

export interface AuthClientArgs {
  apiServerUrl: string
  /**
   * Optional fetch override for tests. When provided we *do not* memoise so
   * every test case can install its own mock without bleed-through.
   */
  fetchImpl?: typeof fetch
}

type AuthClient = ReturnType<typeof createAuthClient<{
  baseURL: string
  plugins: ReturnType<typeof steamClient>[]
}>>

const clientCache = new Map<string, AuthClient>()

/**
 * Cookie-credentialed better-auth client for the auth UI, with the Steam
 * plugin wired in (`linkSteam` / `signIn.steam`). Unlike the Bearer-only
 * stage-ui singleton, this client carries the session cookie.
 */
export function getAuthClient(args: AuthClientArgs): AuthClient {
  if (args.fetchImpl) {
    return createAuthClient({
      baseURL: args.apiServerUrl,
      plugins: [steamClient()],
      fetchOptions: { customFetchImpl: args.fetchImpl },
    })
  }

  const client = clientCache.get(args.apiServerUrl) ?? createAuthClient({
    baseURL: args.apiServerUrl,
    plugins: [steamClient()],
  })
  clientCache.set(args.apiServerUrl, client)
  return client
}
