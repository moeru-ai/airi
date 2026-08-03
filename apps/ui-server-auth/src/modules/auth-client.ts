/**
 * Better-auth client factory for the auth-only SPA (`apps/ui-server-auth`).
 *
 * Use when:
 * - Calling any `/api/auth/*` endpoint from the auth UI (profile read/write,
 *   sign-in / sign-up, password reset, linked accounts management). Lets us
 *   reuse better-auth's typed client surface instead of re-deriving response
 *   shapes from `unknown` JSON in N hand-written wrappers.
 *
 * Why a separate factory (vs. importing the singleton in
 * `packages/stage-ui/src/libs/auth.ts`):
 * - Stage-UI's client is configured for **Bearer-only** access (`credentials:
 *   'omit'` so cookies don't tag along with OIDC JWTs). It also injects a
 *   Bearer token from the auth store on every request — nonsense in this
 *   app, since the auth UI is the page the cookie was *just* set on.
 * - This client uses the better-auth defaults (cookies via
 *   `credentials: 'include'`) and skips the Bearer header. That matches
 *   what the auth UI actually has at hand.
 *
 * Test seam:
 * - Pass `fetchImpl` to substitute `globalThis.fetch`. Better-auth wires it
 *   as `customFetchImpl` (see node_modules/better-auth/dist/client/config.mjs
 *   L+: the spread of `restOfFetchOptions` happens after the default, so a
 *   user-supplied value wins). Production callers omit `fetchImpl` and we
 *   memoise per `apiServerUrl` so we don't rebuild on every render.
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
