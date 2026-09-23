import type { BetterFetch } from '@better-fetch/fetch'

/**
 * Request body for starting a Steam OpenID sign-in or account link.
 *
 * Matches the server steam plugin's `SignInBodySchema` (`/sign-in/steam`
 * and `/link/steam`), which takes `callbackURL` without a `provider` field.
 */
export interface SteamOAuthStartArgs {
  callbackURL: string
  errorCallbackURL?: string
  disableRedirect?: boolean
}

/**
 * Redirect envelope both Steam endpoints return, mirroring better-auth's
 * `/sign-in/social` response shape (`{ url, redirect }`).
 */
export interface SteamOAuthStartResult {
  url?: string
  redirect?: boolean
  status?: boolean
}

/**
 * Client-side counterpart of the server `steam()` auth plugin.
 *
 * Adds typed `linkSteam` / `signIn.steam` actions backed by the plugin's
 * dedicated endpoints, so consumers don't hand-roll `/link/steam` /
 * `/sign-in/steam` requests. Steam's web login is OpenID 2.0, not OAuth2,
 * so better-auth's `/link-social` / `/sign-in/social` can never reach it —
 * `socialProviders` is a fixed OAuth2 list.
 *
 * Removal condition: better-auth natively supports OpenID 2.0 / Steam as a
 * `socialProviders` entry — then both this plugin and the server plugin's
 * custom endpoints collapse into standard provider configuration.
 */
export function steamClient() {
  return {
    id: 'steam-client',
    getActions: ($fetch: BetterFetch) => ({
      linkSteam: (args: SteamOAuthStartArgs) => $fetch<SteamOAuthStartResult>('/link/steam', {
        method: 'POST',
        body: args,
      }),
      signIn: {
        steam: (args: SteamOAuthStartArgs) => $fetch<SteamOAuthStartResult>('/sign-in/steam', {
          method: 'POST',
          body: args,
        }),
      },
    }),
  }
}
