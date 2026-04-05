import type { Page } from 'playwright'

import { sleep } from '@moeru/std'

function iconAttributeSelector(iconName: string): string {
  return `[${iconName.replace(':', '\\:')}]`
}

async function clickControlButtonByIcon(page: Page, iconName: string): Promise<void> {
  const button = page
    .locator('button')
    .filter({
      has: page.locator(iconAttributeSelector(iconName)),
    })
    .last()

  await button.waitFor({ state: 'visible', timeout: 15_000 })
  await button.click({ force: true })
  await sleep(100)
}

export async function expandControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:alt-arrow-up-line-duotone')
}

export async function openSettingsFromControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:settings-minimalistic-outline')
}

export async function openChatFromControlsIsland(page: Page): Promise<void> {
  await clickControlButtonByIcon(page, 'i-solar:chat-line-line-duotone')
}

export async function openHearingFromControlsIsland(page: Page): Promise<Page> {
  const expandButton = page
    .locator('button')
    .filter({
      has: page.locator(iconAttributeSelector('i-solar:alt-arrow-up-line-duotone')),
    })
    .last()

  const hearingButton = expandButton.locator('xpath=ancestor::button[1]/following::button[1]').first()

  await hearingButton.waitFor({ state: 'visible', timeout: 15_000 })
  await hearingButton.hover()
  await hearingButton.click({ force: true })
  await hearingButton.hover()

  await page.getByText('Input device').waitFor({ state: 'visible', timeout: 15_000 })
  return page
}
