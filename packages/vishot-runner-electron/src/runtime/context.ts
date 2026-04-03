import type { ElectronApplication, Page } from 'playwright'

import type { CaptureOptions, ScenarioContext } from './types'

import { dismissDialog, dismissDrawer, swipeDownDrawer } from '../utils/overlays'
import { expandControlsIsland, openChatFromControlsIsland, openHearingFromControlsIsland, openSettingsFromControlsIsland } from '../utils/selectors'
import { goToSettingsConnectionPage } from '../utils/settings'
import { waitForStageWindow } from '../utils/windows'
import { capturePage } from './capture'

export function createScenarioContext(electronApp: ElectronApplication, outputDir: string): ScenarioContext {
  return {
    electronApp,
    outputDir,
    capture(name: string, page: Page, options?: CaptureOptions) {
      return capturePage(outputDir, name, page, options)
    },
    stageWindows: {
      waitFor(name, timeout) {
        return waitForStageWindow(electronApp, name, timeout)
      },
    },
    controlsIsland: {
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
