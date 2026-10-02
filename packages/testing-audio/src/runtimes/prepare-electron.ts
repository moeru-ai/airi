import type { FakemicElectronPrepareContext } from '@proj-airi/vitest-plugin-fakemic'
import type { Page } from 'playwright'

import type { AudioInputSession } from '../types'

import { piniaActionTracingChannelName } from '@proj-airi/stage-shared/types/pinia-action-event'

import { stubForBrowser } from '../setup/browser-probe'
import { createSession } from '../setup/session'

/** Adapts a Fakemic Electron process into an AIRI desktop audio session. */
export default async function prepareElectronRuntime(context: FakemicElectronPrepareContext): Promise<AudioInputSession> {
  await context.app.context().addInitScript(stubForBrowser, piniaActionTracingChannelName)
  const page = await waitForPage(context, (page) => {
    const url = new URL(page.url())
    return url.pathname.endsWith('/index.html') && url.hash === '#/'
  })
  await page.locator('[i-solar\\:alt-arrow-up-line-duotone]').first().waitFor({ state: 'visible', timeout: 30_000 })
  await page.evaluate(stubForBrowser, piniaActionTracingChannelName)

  return createSession({
    electronApp: context.app,
    page,
    target: 'electron',
    close: context.close,
  })
}

async function waitForPage(
  context: FakemicElectronPrepareContext,
  predicate: (page: Page) => boolean,
  timeoutMs = 60_000,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const page = context.app.windows().find(predicate)
    if (page) {
      await page.waitForLoadState('domcontentloaded')
      return page
    }

    await new Promise(resolveWait => setTimeout(resolveWait, 100))
  }

  throw new Error('Timed out while waiting for the Electron renderer')
}
