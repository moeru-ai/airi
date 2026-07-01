import { applyOIDCTokens, fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { completeOIDCCallbackUrl } from '@proj-airi/stage-ui/libs/auth-callback'
import { consumeFlowState, exchangeCodeForTokens } from '@proj-airi/stage-ui/libs/auth-oidc'
import { configureIOSSignIn } from '@proj-airi/stage-ui/libs/auth-platform'

import { openNativeAuthSession } from './native-auth'

export function installPocketAuth(): void {
  configureIOSSignIn(async (authorizeUrl) => {
    const callbackUrl = await openNativeAuthSession(authorizeUrl)
    await completeOIDCCallbackUrl(callbackUrl, {
      consumeFlowState,
      exchangeCodeForTokens,
      applyOIDCTokens,
      fetchSession,
    })
  })
}
