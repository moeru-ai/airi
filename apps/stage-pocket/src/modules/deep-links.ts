import type { URLOpenListenerEvent } from '@capacitor/app'
import type { Router } from 'vue-router'

import { App } from '@capacitor/app'
import { applyOIDCTokens, fetchSession } from '@proj-airi/stage-ui/libs/auth'
import { consumeFlowState, exchangeCodeForTokens } from '@proj-airi/stage-ui/libs/auth-oidc'

export function installDeepLinks(router: Router): void {
  App.addListener('appUrlOpen', async (event?: URLOpenListenerEvent) => {
    console.log('urlOpener', event)
    const url = new URL(event?.url ?? '')
    if (url.host === 'localhost' && url.pathname === '/auth/callback') {
      const code = url.searchParams.get('code')
      const state = url.searchParams.get('state')
      if (!code || !state) {
        return
      }
      const persisted = consumeFlowState()
      if (!persisted) {
        console.error('OIDC 流程状态已失效或不存在')
        return
      }
      const tokens = await exchangeCodeForTokens(code, persisted.flowState, persisted.params, state)
      await applyOIDCTokens(tokens, persisted.params.clientId)
      await fetchSession()
      router.replace('/')
    }
  })
}
