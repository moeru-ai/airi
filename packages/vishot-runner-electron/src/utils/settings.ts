import type { Page } from 'playwright'

function normalizeLabel(label: RegExp | string): string | RegExp {
  return label
}

function getSettingsSwitch(settingsPage: Page, label: RegExp | string) {
  const labelLocator = settingsPage.getByText(normalizeLabel(label)).first()
  const row = labelLocator.locator('xpath=ancestor::label[1]')
  const button = row.locator('button[role="switch"]').first()

  return { labelLocator, row, button }
}

function normalizeHashPath(hash: string): string {
  const withoutHash = hash.startsWith('#')
    ? hash.slice(1)
    : hash

  return withoutHash || '/'
}

function getCurrentHashPath(settingsPage: Page): string {
  return normalizeHashPath(new URL(settingsPage.url()).hash)
}

export async function goToSettingsRoute(settingsPage: Page, routePath: string): Promise<Page> {
  const normalizedRoutePath = routePath.startsWith('/')
    ? routePath
    : `/${routePath}`

  if (getCurrentHashPath(settingsPage) !== normalizedRoutePath) {
    await settingsPage.evaluate((nextRoutePath) => {
      window.location.hash = nextRoutePath
    }, normalizedRoutePath)
    await settingsPage.waitForFunction((expectedHashPath) => {
      return window.location.hash === `#${expectedHashPath}`
    }, normalizedRoutePath)
  }

  return settingsPage
}

export async function openSettingsConnectionPage(_mainPage: Page, settingsPage: Page): Promise<void> {
  if (!settingsPage.url().includes('#/settings/connection')) {
    await settingsPage.getByText(/connection|websocket|router/i).first().click({ force: true })
    await settingsPage.waitForURL(/#\/settings\/connection/)
  }
}

export async function goToSettingsConnectionPage(settingsPage: Page): Promise<Page> {
  return goToSettingsRoute(settingsPage, '/settings/connection')
}

export async function toggleSettingsSwitchByLabel(settingsPage: Page, label: RegExp | string): Promise<{ before: string, after: string }> {
  const { labelLocator, row, button } = getSettingsSwitch(settingsPage, label)

  await labelLocator.waitFor({ state: 'visible', timeout: 15_000 })
  await row.waitFor({ state: 'visible', timeout: 15_000 })

  const before = (await button.getAttribute('aria-checked')) ?? (await button.getAttribute('data-state')) ?? ''
  await button.click({ force: true })
  await settingsPage.waitForTimeout(300)
  const after = (await button.getAttribute('aria-checked')) ?? (await button.getAttribute('data-state')) ?? ''

  if (before === after) {
    throw new Error(`Custom switch state did not change for label ${String(label)}`)
  }

  return { before, after }
}
