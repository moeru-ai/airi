import type { BetterAuthClientPlugin } from 'better-auth'

/**
 * Request body for starting a Steam OpenID sign-in or account link.
 *
 * Matches the server steam plugin's `SignInBodySchema` (`/sign-in/steam`
 * and `/link/steam`), which takes `callbackURL` without a `provider` field.
 */
export interface SteamOAuthStartArgs {
  callbackURL: string
  errorCallbackURL?: string
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
 * Structural view of the client's generic request helper, extracted from
 * the plugin contract so this module does not depend on the transitive
 * `@better-fetch/fetch` package directly.
 */
type SteamAuthClientFetch = Parameters<NonNullable<BetterAuthClientPlugin['getActions']>>[0]

/**
 * Client-side counterpart of the server `steam()` auth plugin.
 *
 * Use when:
 * - Creating a better-auth client for a surface whose server mounts the
 *   Steam plugin (ui-server-auth, stage-web, stage-tamagotchi). Adds typed
 *   `linkSteam` and `signIn.steam` actions so callers never hand-roll the
 *   `/link/steam` / `/sign-in/steam` requests.
 *
 * Why Steam needs its own actions: Steam's web login is OpenID 2.0, not
 * OAuth2, so better-auth's `/link-social` and `/sign-in/social` only
 * resolve registered OAuth2 `socialProviders` and can never reach Steam.
 * The server plugin therefore exposes dedicated endpoints; this plugin
 * surfaces them as first-class client methods instead of leaving every
 * consumer to dig through the generic `$fetch` escape hatch.
 *
 * Removal condition: better-auth natively supports OpenID 2.0 / Steam as a
 * `socialProviders` entry — then both this plugin and the server plugin's
 * custom endpoints collapse into standard provider configuration.
 */
export function steamClient() {
  return {
    id: 'steam-client',
    getActions: ($fetch: SteamAuthClientFetch) => ({
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
