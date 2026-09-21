import type { EventContext } from '@moeru/eventa'
import type { Router } from 'vue-router'

import { mobileBackRequested, mobileNavigate } from '../../shared/eventa/mobile'

/** Returns to the previous app route, or home after a direct route launch. */
export async function returnToStage(router: Router): Promise<void> {
  if (router.options.history.state.back) {
    router.back()
    return
  }

  await router.replace('/')
}

/**
 * Connects native Android navigation to the one leader renderer.
 * The caller disposes both subscriptions before disposing the host context.
 * System Back exits only at home. In-page Back never exits the application.
 */
export function installMobileNavigation<Extensions, EmitOptions>(context: EventContext<Extensions, EmitOptions>, router: Router, quit: () => Promise<void>): () => void {
  const stopNavigate = context.on(mobileNavigate, async ({ body }) => {
    if (!body)
      return

    if (body.replace)
      await router.replace(body.route)
    else
      await router.push(body.route)
  })
  const stopBack = context.on(mobileBackRequested, async () => {
    if (router.currentRoute.value.path === '/') {
      await quit()
      return
    }

    await returnToStage(router)
  })

  return () => {
    stopNavigate()
    stopBack()
  }
}
