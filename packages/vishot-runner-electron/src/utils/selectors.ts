import type { Page } from 'playwright'

import { sleep } from '@moeru/std'

const controlsIslandReadyTimeoutMs = 30_000

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

export async function waitForControlsIslandReady(page: Page): Promise<void> {
  const button = controlButtonsByIcon(page, 'i-solar:alt-arrow-up-line-duotone').first()

  await button.waitFor({ state: 'visible', timeout: controlsIslandReadyTimeoutMs })
}

async function clickControlButtonByIcon(page: Page, iconName: string): Promise<void> {
  const button = controlButtonsByIcon(page, iconName).first()

  await button.waitFor({ state: 'visible', timeout: controlsIslandReadyTimeoutMs })
  await button.click({ force: true })
  await sleep(100)
}

export async function expandControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:alt-arrow-up-line-duotone')
}

export async function openSettingsFromControlsIsland(page: Page): Promise<void> {
  await waitForControlsIslandReady(page)

  try {
    await clickControlButtonByIcon(page, 'i-solar:settings-minimalistic-outline')
  }
  catch {
    // NOTICE: The island can report ready while still collapsed on slower frames.
    // Expand once and retry settings click to reduce flakiness during capture.
    await expandControlsIsland(page).catch(() => {})
    await clickControlButtonByIcon(page, 'i-solar:settings-minimalistic-outline')
  }
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
