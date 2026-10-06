import type { URLOpenListenerEvent } from '@capacitor/app'
import type { Router } from 'vue-router'

import { App } from '@capacitor/app'
import { completeOIDCSignIn } from '@proj-airi/stage-ui/libs/auth'

import { onKirieAndroidUrlOpen } from './kirie-android-authentication'
import { isKirieAndroid } from './kirie-android-eventa'

async function handleUrlOpen(urlValue: string, router: Router): Promise<void> {
  try {
    const url = new URL(urlValue)
    if (url.host === 'links' && url.pathname === '/auth/callback') {
      if (await completeOIDCSignIn(urlValue))
        await router.replace('/')
    }
  }
  catch (error) {
    console.error('Failed to handle deep link:', error)
  }
}

export function installDeepLinks(router: Router): void {
  if (isKirieAndroid) {
    onKirieAndroidUrlOpen(url => void handleUrlOpen(url, router))
    return
  }

  App.addListener('appUrlOpen', async (event?: URLOpenListenerEvent) => {
    if (!event?.url)
      return

    await handleUrlOpen(event.url, router)
  })
}
