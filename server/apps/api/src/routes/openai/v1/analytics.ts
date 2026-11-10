/** Client runtime declared by the chat request header. */
export type ChatAppSurface = 'web' | 'mobile' | 'electron'

export const AIRI_CHAT_SESSION_ID_HEADER = 'x-airi-session-id'
export const AIRI_CHAT_ROUND_ID_HEADER = 'x-airi-round-id'
export const AIRI_CHAT_APP_SURFACE_HEADER = 'x-airi-app-surface'

const CLIENT_CHAT_ANALYTICS_SURFACES = new Set<ChatAppSurface>(['web', 'mobile', 'electron'])

/**
 * Resolves the product runtime from a trusted client hint.
 *
 * Unknown values stay absent rather than being attributed to a client runtime.
 */
export function resolveChatAnalyticsSurface(value: string | undefined): ChatAppSurface | undefined {
  if (CLIENT_CHAT_ANALYTICS_SURFACES.has(value as ChatAppSurface))
    return value as ChatAppSurface

  return undefined
}
