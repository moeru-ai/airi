import type { AiGenerationAppSurface } from '../../../services/domain/product-events'

export const AIRI_CHAT_SESSION_ID_HEADER = 'x-airi-session-id'
export const AIRI_CHAT_ROUND_ID_HEADER = 'x-airi-round-id'
export const AIRI_CHAT_APP_SURFACE_HEADER = 'x-airi-app-surface'

const CLIENT_CHAT_ANALYTICS_SURFACES = new Set<AiGenerationAppSurface>(['web', 'mobile', 'electron'])

export function resolveChatAnalyticsSurface(value: string | undefined): AiGenerationAppSurface {
  if (CLIENT_CHAT_ANALYTICS_SURFACES.has(value as AiGenerationAppSurface))
    return value as AiGenerationAppSurface

  return 'server'
}
