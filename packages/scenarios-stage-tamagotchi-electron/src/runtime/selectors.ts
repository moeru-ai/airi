import type { Page } from 'playwright'

import { sleep } from '@moeru/std'

const controlsIslandReadyTimeoutMs = 30_000

export async function waitForControlsIslandReady(page: Page): Promise<void> {
  const button = controlButtonsByIcon(page, 'i-solar:alt-arrow-up-line-duotone').first()

  await button.waitFor({ state: 'visible', timeout: controlsIslandReadyTimeoutMs })
}

export async function expandControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:alt-arrow-up-line-duotone')
}

export async function openSettingsFromControlsIsland(page: Page): Promise<void> {
  await waitForControlsIslandReady(page)

  const settingsButton = controlButtonsByIcon(page, 'i-solar:settings-minimalistic-outline').first()
  const controlsToggle = controlButtonsByIcon(page, 'i-solar:alt-arrow-up-line-duotone').first()
  if (!await settingsButton.isVisible().catch(() => false)) {
    await controlsToggle.click({ force: true })
    const opened = await settingsButton.waitFor({ state: 'visible', timeout: 1_000 }).then(() => true, () => false)
    if (!opened)
      await controlsToggle.click({ force: true })
  }

  await settingsButton.waitFor({ state: 'visible', timeout: controlsIslandReadyTimeoutMs })
  await settingsButton.click({ force: true })
  await sleep(100)
}

export async function openChatFromControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:chat-line-line-duotone')
}

export async function openHearingFromControlsIsland(page: Page): Promise<Page> {
  const expandButton = controlButtonsByIcon(page, 'i-solar:alt-arrow-up-line-duotone').first()
  const hearingButton = expandButton.locator('xpath=ancestor::button[1]/following::button[1]').first()

  await hearingButton.waitFor({ state: 'visible', timeout: 15_000 })
  await hearingButton.hover()
  await hearingButton.click({ force: true })
  await hearingButton.hover()

  await page.getByText('Input device').waitFor({ state: 'visible', timeout: 15_000 })
  return page
}

function iconAttributeSelector(iconName: string): string {
  return `[${iconName.replace(':', '\\:')}]`
}

function controlButtonsByIcon(page: Page, iconName: string) {
  return page
    .locator('button')
    .filter({
      has: page.locator(iconAttributeSelector(iconName)),
    })
}

async function clickControlButtonByIcon(page: Page, iconName: string): Promise<void> {
  const button = controlButtonsByIcon(page, iconName).first()

  await button.waitFor({ state: 'visible', timeout: controlsIslandReadyTimeoutMs })
  await button.click({ force: true })
  await sleep(100)
}
