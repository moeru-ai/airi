import type { ElectronApplication, Page } from 'playwright'

const stageWindowPollIntervalMs = 250
const stageWindowActivationDelayMs = 750
const stageWindowClassificationLoadStateTimeoutMs = 500

async function inferRoute(page: Page): Promise<string> {
  const url = page.url()
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1) {
    return ''
  }

  const hash = url.slice(hashIndex + 1)
  return hash.length > 0 ? hash : '/'
}

async function classifyWindow(page: Page): Promise<StageWindowSnapshot | null> {
  await page.waitForLoadState('domcontentloaded', { timeout: stageWindowClassificationLoadStateTimeoutMs }).catch(() => undefined)

  const title = await page.title()
  const url = page.url()
  const route = await inferRoute(page)

  if (url.includes('beat-sync.html') || title.includes('BeatSync') || url.startsWith('devtools://')) {
    return null
  }

  if (route === '/chat' || title === 'Chat') {
    return { name: 'chat', page, title, route }
  }

  if (route.startsWith('/settings') || title === 'Settings') {
    return { name: 'settings', page, title, route }
  }

  if (route.startsWith('/onboarding') || title === 'Welcome to AIRI') {
    return null
  }

  if (route === '/' || title === 'AIRI') {
    return { name: 'main', page, title, route }
  }

  const bodyText = await page.locator('body').textContent().catch(() => '') || ''
  if (bodyText.includes('Open the DevTools to troubleshoot BeatSync')) {
    return null
  }

  if (bodyText.includes('Chat')) {
    return { name: 'chat', page, title, route }
  }

  if (bodyText.includes('Fade on Hover') || bodyText.includes('Open WebSocket settings')) {
    return { name: 'main', page, title, route }
  }

  return null
}

export type StageWindowName = 'main' | 'settings' | 'chat'

export interface StageWindowSnapshot {
  name: StageWindowName
  page: Page
  title: string
  route: string
}

export async function waitForStageWindow(electronApp: ElectronApplication, name: StageWindowName, timeout = 30_000): Promise<StageWindowSnapshot> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const windows = electronApp.windows()

    for (const page of windows) {
      const classified = await classifyWindow(page)
      if (classified?.name === name) {
        await page.bringToFront()
        await page.waitForTimeout(stageWindowActivationDelayMs)
        return classified
      }
    }

    await new Promise(resolve => setTimeout(resolve, stageWindowPollIntervalMs))
  }

  throw new Error(`Timed out waiting for "${name}" window`)
}
