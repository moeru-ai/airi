import type { FakemicWebPrepareContext } from '@proj-airi/vitest-plugin-fakemic'

import type { AudioInputSession } from '../types'

import { stubForBrowser } from '../setup/browser-probe'
import { createSession } from '../setup/session'

/** Adapts a Fakemic Chromium process into an AIRI Web audio session. */
export default async function prepareWebRuntime(context: FakemicWebPrepareContext): Promise<AudioInputSession> {
  await context.context.addInitScript(stubForBrowser)

  const page = await context.context.newPage()
  await page.goto(context.runtime.url)

  return createSession({
    page,
    target: 'web',
    close: context.close,
  })
}
