import { usesSteamLocalAsr } from '@proj-airi/stage-ui/libs/providers/transcription-policy'

/** Keep old provider URLs from exposing disabled ASR configuration in Steam. */
export function resolveSteamAsrRedirect(path: string, hasProvider: (id: string) => boolean): string | undefined {
  if (!usesSteamLocalAsr())
    return undefined
  if (/^\/settings\/modules\/(?:artistry|web-search|messaging-discord|x)(?:\/|$)/.test(path))
    return '/settings/modules'
  if (path.startsWith('/settings/providers/artistry/'))
    return '/settings/providers'
  if (path.startsWith('/settings/providers/transcription/'))
    return '/settings/modules/hearing'

  const providerRoute = /^\/settings\/providers\/[^/]+\/([^/]+)/.exec(path)
  if (providerRoute && !hasProvider(decodeURIComponent(providerRoute[1])))
    return '/settings/providers'

  const match = path.match(/^\/v2\/settings\/providers\/edit\/([^/]+)\/?$/)
  if (match && !hasProvider(decodeURIComponent(match[1])))
    return '/v2/settings/providers'
}
