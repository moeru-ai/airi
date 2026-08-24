import type { ManualRuntime } from './types'

import { sleep } from '@moeru/std'

export function normalizeHashPath(hash: string): string {
  const withoutHash = hash.startsWith('#')
    ? hash.slice(1)
    : hash

  return withoutHash || '/'
}

export function isTimeoutLikeError(error: unknown): boolean {
  return error instanceof Error && error.name === 'TimeoutError'
}

export async function ensureControlsIslandExpanded(runtime: ManualRuntime) {
  const { mainWindow, context } = runtime
  const chatButton = mainWindow.page
    .locator('button')
    .filter({
      has: mainWindow.page.locator('[i-solar\\:chat-line-line-duotone]'),
    })
    .first()

  const chatButtonVisible = await chatButton.isVisible().catch(() => false)

  if (!chatButtonVisible) {
    await context.controlsIsland.expand(mainWindow.page)
    await sleep(250)
  }
}

export async function getChatWindowSnapshot(runtime: ManualRuntime) {
  if (runtime.chatWindowSnapshot) {
    return runtime.chatWindowSnapshot
  }

  await ensureControlsIslandExpanded(runtime)

  const chatWindowSnapshot = await runtime.context.controlsIsland.openChat(runtime.mainWindow.page)
  runtime.chatWindowSnapshot = chatWindowSnapshot

  return chatWindowSnapshot
}

export async function getSettingsWindowSnapshot(runtime: ManualRuntime) {
  if (runtime.settingsWindowSnapshot) {
    return runtime.settingsWindowSnapshot
  }

  await runtime.mainWindow.page.bringToFront()
  await runtime.context.controlsIsland.waitForReady(runtime.mainWindow.page)
  await ensureControlsIslandExpanded(runtime)

  const settingsWindowSnapshot = await runtime.context.controlsIsland.openSettings(runtime.mainWindow.page)
  runtime.settingsWindowSnapshot = settingsWindowSnapshot

  return settingsWindowSnapshot
}

export async function waitForRouteReadiness(
  runtime: ManualRuntime,
  routePath: string,
  readyPattern: RegExp,
) {
  const settingsWindowSnapshot = await getSettingsWindowSnapshot(runtime)

  await runtime.context.settingsWindow.goToRoute(settingsWindowSnapshot.page, routePath)

  try {
    await settingsWindowSnapshot.page.getByText(readyPattern).first().waitFor({ state: 'visible', timeout: 15_000 })
  }
  catch (error) {
    if (!isTimeoutLikeError(error)) {
      throw error
    }

    const currentHashPath = normalizeHashPath(new URL(settingsWindowSnapshot.page.url()).hash)
    if (currentHashPath !== routePath) {
      throw error
    }

    // NOTICE: Some settings and devtools pages animate in or hydrate content
    // asynchronously. Give known-slow pages one final bounded grace period.
    await sleep(1250)
    await settingsWindowSnapshot.page.getByText(readyPattern).first().waitFor({ state: 'visible', timeout: 5_000 })
  }

  return settingsWindowSnapshot
}
