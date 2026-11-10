import { isStageCapacitor } from '@proj-airi/stage-shared'

const FALLBACK = 'http://localhost'
const POCKET_CALLBACK_ORIGIN = 'ai.moeru.airi-pocket://links'

function getRedirectOrigin(): string {
  if (import.meta.env.VITE_OIDC_REDIRECT_URI)
    return import.meta.env.VITE_OIDC_REDIRECT_URI

  // Stage Pocket receives the system browser callback through its app URL scheme.
  if (isStageCapacitor())
    return POCKET_CALLBACK_ORIGIN

  // Browser builds return to the origin that started the authorization flow.
  if (typeof window !== 'undefined')
    return window.location?.origin ?? FALLBACK

  // Non-browser imports need a stable origin while no deployment override exists.
  return FALLBACK
}

const origin = getRedirectOrigin()

export const OIDC_CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID
  || (isStageCapacitor() ? 'airi-stage-pocket' : 'airi-stage-web')

export const OIDC_REDIRECT_URI = `${origin}/auth/callback`
