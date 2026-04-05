/* eslint-disable e18e/prefer-static-regex */
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

export async function openSettingsConnectionPage(_mainPage: Page, settingsPage: Page): Promise<void> {
  if (!settingsPage.url().includes('#/settings/connection')) {
    await settingsPage.getByText(/connection|websocket|router/i).first().click({ force: true })
    await settingsPage.waitForURL(/#\/settings\/connection/)
  }
}

export async function goToSettingsConnectionPage(settingsPage: Page): Promise<Page> {
  if (!settingsPage.url().includes('#/settings/connection')) {
    await settingsPage.getByText(/connection|websocket|router/i).first().click({ force: true })
    await settingsPage.waitForURL(/#\/settings\/connection/)
  }

  return settingsPage
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
