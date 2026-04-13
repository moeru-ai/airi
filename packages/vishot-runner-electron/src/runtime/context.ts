import type { ElectronApplication, Page } from 'playwright'

import type { CaptureOptions, ScenarioContext } from './types'

import { dismissDialog, dismissDrawer, swipeDownDrawer } from '../utils/overlays'
import { expandControlsIsland, openChatFromControlsIsland, openHearingFromControlsIsland, openSettingsFromControlsIsland, waitForControlsIslandReady } from '../utils/selectors'
import { goToSettingsConnectionPage, goToSettingsRoute } from '../utils/settings'
import { waitForStageWindow } from '../utils/windows'
import { capturePage } from './capture'

function mergeCaptureOptions(defaultOptions?: CaptureOptions, options?: CaptureOptions): CaptureOptions | undefined {
  const transformers = [
    ...(defaultOptions?.transformers ?? []),
    ...(options?.transformers ?? []),
  ]

  if (!defaultOptions && !options) {
    return undefined
  }

  return {
    fullPage: options?.fullPage ?? defaultOptions?.fullPage,
    transformers: transformers.length > 0 ? transformers : undefined,
  }
}

export function createScenarioContext(
  electronApp: ElectronApplication,
  outputDir: string,
  defaultCaptureOptions?: CaptureOptions,
): ScenarioContext {
  return {
    electronApp,
    outputDir,
    capture(name: string, page: Page, options?: CaptureOptions) {
      return capturePage(outputDir, name, page, mergeCaptureOptions(defaultCaptureOptions, options))
    },
    stageWindows: {
      waitFor(name, timeout) {
        return waitForStageWindow(electronApp, name, timeout)
      },
    },
    controlsIsland: {
      waitForReady(page) {
        return waitForControlsIslandReady(page)
      },
      async expand(page) {
        await expandControlsIsland(page)
      },
      async openSettings(page) {
        await openSettingsFromControlsIsland(page)
        return waitForStageWindow(electronApp, 'settings')
      },
      async openChat(page) {
        await openChatFromControlsIsland(page)
        return waitForStageWindow(electronApp, 'chat')
      },
      openHearing(page) {
        return openHearingFromControlsIsland(page)
      },
    },
    settingsWindow: {
      waitFor(timeout) {
        return waitForStageWindow(electronApp, 'settings', timeout)
      },
      goToConnection(page) {
        return goToSettingsConnectionPage(page)
      },
      goToRoute(page, routePath) {
        return goToSettingsRoute(page, routePath)
      },
    },
    dialogs: {
      dismiss(page) {
        return dismissDialog(page)
      },
    },
    drawers: {
      swipeDown(page) {
        return swipeDownDrawer(page)
      },
      dismiss(page) {
        return dismissDrawer(page)
      },
    },
  }
}
