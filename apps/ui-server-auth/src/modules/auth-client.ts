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

import { createAuthClient } from 'better-auth/vue'

export interface AuthClientArgs {
  apiServerUrl: string
  /**
   * Optional fetch override for tests. When provided we *do not* memoise so
   * every test case can install its own mock without bleed-through.
   */
  fetchImpl?: typeof fetch
}

const cache = new Map<string, ReturnType<typeof createAuthClient>>()

/**
 * Build (or reuse) a better-auth client pointed at the given server.
 *
 * Use when:
 * - Any module needs to call `/api/auth/*` from the auth UI.
 *
 * Expects:
 * - `apiServerUrl` is a fully-qualified origin (e.g. `https://api.airi.test`
 *   or `http://localhost:3000`). Trailing slash optional; better-auth
 *   normalises.
 *
 * Returns:
 * - A typed client whose methods (`getSession`, `updateUser`, `listAccounts`,
 *   etc.) match the better-auth endpoint surface. Tokens / cookies handled
 *   via `credentials: 'include'` defaults.
 */
export function getAuthClient(args: AuthClientArgs): ReturnType<typeof createAuthClient> {
  if (args.fetchImpl) {
    // Tests: never cache, never share. The injected fetchImpl is the whole
    // point of the call.
    return createAuthClient({
      baseURL: args.apiServerUrl,
      fetchOptions: { customFetchImpl: args.fetchImpl },
    })
  }

  const cached = cache.get(args.apiServerUrl)
  if (cached)
    return cached

  const client = createAuthClient({ baseURL: args.apiServerUrl })
  cache.set(args.apiServerUrl, client)
  return client
}
