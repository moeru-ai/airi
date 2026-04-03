/* eslint-disable e18e/prefer-static-regex */
import type { ElectronApplication, Page } from 'playwright'

import { expandControlsIsland, openSettingsFromControlsIsland } from './selectors'
import { waitForStageWindow } from './windows'

const mainLoadingProbeSamples = 3
const mainLoadingProbeIntervalMs = 250

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

async function navigatePageToConnectionSettings(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.location.hash = '#/settings/connection'
  })
  await page.waitForURL(/#\/settings\/connection/)
}

async function findOnboardingPage(electronApp: ElectronApplication): Promise<Page | null> {
  for (const page of electronApp.windows()) {
    if (page.url().includes('#/onboarding')) {
      return page
    }
  }

  return null
}

function isTimedOutWaitingForMainWindow(error: unknown): boolean {
  return error instanceof Error && error.message === 'Timed out waiting for "main" window'
}

async function isMainWindowStuckLoading(page: Page): Promise<boolean> {
  for (let index = 0; index < mainLoadingProbeSamples; index += 1) {
    const bodyText = await page.locator('body').textContent().catch(() => '') || ''
    if (!bodyText.includes('Loading...')) {
      return false
    }

    if (index < mainLoadingProbeSamples - 1) {
      await page.waitForTimeout(mainLoadingProbeIntervalMs)
    }
  }

  return true
}

export async function openConnectionSettingsWindow(electronApp: ElectronApplication): Promise<Page> {
  let mainWindow: Awaited<ReturnType<typeof waitForStageWindow>> | null = null

  try {
    mainWindow = await waitForStageWindow(electronApp, 'main')
  }
  catch (error) {
    if (!isTimedOutWaitingForMainWindow(error)) {
      throw error
    }

    const onboardingPage = await findOnboardingPage(electronApp)
    if (!onboardingPage) {
      throw new Error('Unable to reach the main window and no onboarding window was available for fallback navigation')
    }

    // NOTICE: Some local app states keep the main route on Loading... while the
    // onboarding renderer is still available. Routing that renderer directly to
    // settings keeps the interaction testable without depending on the island.
    await navigatePageToConnectionSettings(onboardingPage)
    return onboardingPage
  }

  if (await isMainWindowStuckLoading(mainWindow.page)) {
    const onboardingPage = await findOnboardingPage(electronApp)
    if (!onboardingPage) {
      throw new Error('The main window was stuck on Loading... and no onboarding window was available for fallback navigation')
    }

    await navigatePageToConnectionSettings(onboardingPage)
    return onboardingPage
  }

  await mainWindow.page.bringToFront()
  await expandControlsIsland(mainWindow.page)
  await openSettingsFromControlsIsland(mainWindow.page)

  const settingsWindow = await waitForStageWindow(electronApp, 'settings', 10_000)
  await goToSettingsConnectionPage(settingsWindow.page)
  return settingsWindow.page
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
