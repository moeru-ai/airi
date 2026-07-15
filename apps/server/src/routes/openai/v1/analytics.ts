import type { AiGenerationAppSurface } from '../../../services/domain/product-events'

export const AIRI_CHAT_SESSION_ID_HEADER = 'x-airi-session-id'
export const AIRI_CHAT_ROUND_ID_HEADER = 'x-airi-round-id'
export const AIRI_CHAT_APP_SURFACE_HEADER = 'x-airi-app-surface'

const CLIENT_CHAT_ANALYTICS_SURFACES = new Set<AiGenerationAppSurface>(['web', 'mobile', 'electron'])

/**
 * Resolves the product runtime from a trusted client hint.
 *
 * Unknown values are not coerced to `server`: `$ai_generation` uses
 * `capture_surface` for the process that emitted the event, while
 * `app_surface` stays reserved for the user's actual product runtime.
 */
export function resolveChatAnalyticsSurface(value: string | undefined): AiGenerationAppSurface | undefined {
  if (CLIENT_CHAT_ANALYTICS_SURFACES.has(value as AiGenerationAppSurface))
    return value as AiGenerationAppSurface

  return undefined
}
