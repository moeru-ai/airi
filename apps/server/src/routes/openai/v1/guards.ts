import type { V1RouteDeps } from './types'

import { authGuard } from '../../../middlewares/auth'
import { configGuard } from '../../../middlewares/config-guard'
import { rateLimiter } from '../../../middlewares/rate-limit'

export function createV1RouteGuards(deps: V1RouteDeps) {
  return {
    authGuard,
    chatGuard: configGuard(deps.configKV, ['FLUX_PER_REQUEST'], 'Service is not available yet'),
    completionsRateLimit: rateLimiter({
      max: 60,
      windowSec: 60,
      metrics: deps.rateLimitMetrics,
      routeLabel: 'openai.completions',
    }),
    ttsGuard: configGuard(deps.configKV, ['FLUX_PER_1K_CHARS_TTS'], 'TTS service is not available yet'),
  }
}
