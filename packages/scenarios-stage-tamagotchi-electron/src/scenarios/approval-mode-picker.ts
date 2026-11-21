import type { ElectronApplication, Page } from 'playwright'

import { defineStageTamagotchiScenario } from '../context'

export default defineStageTamagotchiScenario({
  id: 'approval-mode-picker',
  async run({ capture, electronApp, stageWindows }) {
    await skipOnboarding(electronApp)

    const mainWindow = await stageWindows.waitFor('main')
    await mainWindow.page.getByTestId('controls-island-chat').click({ force: true })
    const chatPage = await waitForChatRenderer(electronApp)
    const menuButton = chatPage.getByTestId('approval-menu-trigger')
    await menuButton.waitFor({ state: 'visible' })
    await menuButton.click()

    const commandAuto = chatPage.getByTestId('approval-terminal-auto')
    await commandAuto.waitFor({ state: 'visible' })
    await chatPage.waitForFunction(() => {
      const button = document.querySelector('[data-testid="approval-terminal-auto"]')
      return button instanceof HTMLButtonElement && (button.title !== '' || !button.disabled)
    })
    await capture('approval-mode-picker', chatPage)

    if (!(await commandAuto.isEnabled()))
      return

    await commandAuto.click()
    const autoResultPage = await waitForAutoResult(electronApp, chatPage)
    await capture('approval-auto-result', autoResultPage)
  },
})

async function skipOnboarding(electronApp: ElectronApplication): Promise<void> {
  const mainPage = await waitForMainRenderer(electronApp)
  await mainPage.evaluate(() => {
    globalThis.localStorage.setItem('onboarding/completed', 'true')
    globalThis.localStorage.setItem('onboarding/skipped', 'false')
  })

  for (const page of electronApp.windows()) {
    if (hashRoute(page.url()).startsWith('/onboarding'))
      await page.close().catch(() => undefined)
  }

  await mainPage.reload({ waitUntil: 'domcontentloaded' })
}

async function waitForMainRenderer(electronApp: ElectronApplication, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    for (const page of electronApp.windows()) {
      if (hashRoute(page.url()) === '/')
        return page
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Timed out waiting for the AIRI main renderer')
}

async function waitForChatRenderer(electronApp: ElectronApplication, timeout = 30_000): Promise<Page> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    const page = electronApp.windows().find((window) => {
      const route = hashRoute(window.url())
      return route === '/chat' || route === '/chat-floating'
    })
    if (page)
      return page

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Timed out waiting for the AIRI chat renderer')
}

async function waitForAutoResult(electronApp: ElectronApplication, chatPage: Page, timeout = 10_000): Promise<Page> {
  const deadline = Date.now() + timeout

  while (Date.now() < deadline) {
    if (await chatPage.getByRole('alert').isVisible().catch(() => false))
      return chatPage

    for (const page of electronApp.windows()) {
      if (page.url().includes('/terminal-approval') && await page.getByTestId('approval-confirm').isVisible().catch(() => false))
        return page
    }

    await new Promise(resolve => setTimeout(resolve, 250))
  }

  throw new Error('Timed out waiting for the Auto approval result')
}

function hashRoute(url: string): string {
  const hashIndex = url.indexOf('#')
  if (hashIndex === -1)
    return ''

  return url.slice(hashIndex + 1) || '/'
}
