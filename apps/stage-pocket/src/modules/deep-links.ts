import type { URLOpenListenerEvent } from '@capacitor/app'
import type { Router } from 'vue-router'

import { App } from '@capacitor/app'
import { completeOIDCSignIn } from '@proj-airi/stage-ui/libs/auth'

export function installDeepLinks(router: Router): void {
  App.addListener('appUrlOpen', async (event?: URLOpenListenerEvent) => {
    if (!event?.url)
      return

    try {
      const url = new URL(event.url)
      if (url.host === 'links' && url.pathname === '/auth/callback') {
        if (await completeOIDCSignIn(event.url))
          await router.replace('/')
      }
    }
    catch (error) {
      console.error('Failed to handle deep link:', error)
    }
  })
}
