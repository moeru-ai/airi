import type { ElectronScenario, ScenarioContext } from '@vishot/source-electron'
import type { Page } from 'playwright'

import type { StageWindowName, StageWindowSnapshot } from './runtime/windows'

import { defineScenario } from '@vishot/source-electron'

import { dismissDialog, dismissDrawer, swipeDownDrawer } from './runtime/overlays'
import { expandControlsIsland, openChatFromControlsIsland, openHearingFromControlsIsland, openSettingsFromControlsIsland, waitForControlsIslandReady } from './runtime/selectors'
import { goToSettingsConnectionPage, goToSettingsRoute } from './runtime/settings'
import { waitForStageWindow } from './runtime/windows'

export interface ControlsIslandApi {
  expand: (page: Page) => Promise<void>
  openChat: (page: Page) => Promise<StageWindowSnapshot>
  openHearing: (page: Page) => Promise<Page>
  openSettings: (page: Page) => Promise<StageWindowSnapshot>
  waitForReady: (page: Page) => Promise<void>
}

export interface DialogsApi {
  dismiss: (page: Page) => Promise<void>
}

export interface DrawersApi {
  dismiss: (page: Page) => Promise<void>
  swipeDown: (page: Page) => Promise<void>
}

export interface SettingsWindowApi {
  goToConnection: (page: Page) => Promise<Page>
  goToRoute: (page: Page, routePath: string) => Promise<Page>
  waitFor: (timeout?: number) => Promise<StageWindowSnapshot>
}

export interface StageTamagotchiScenario {
  id: string
  run: (context: StageTamagotchiScenarioContext) => Promise<void>
}

/**
 * Generic Vishot Electron context plus AIRI stage-tamagotchi navigation helpers.
 */
export interface StageTamagotchiScenarioContext extends ScenarioContext {
  controlsIsland: ControlsIslandApi
  dialogs: DialogsApi
  drawers: DrawersApi
  settingsWindow: SettingsWindowApi
  stageWindows: StageWindowsApi
}

export interface StageWindowsApi {
  waitFor: (name: StageWindowName, timeout?: number) => Promise<StageWindowSnapshot>
}

/**
 * Adds AIRI-specific window and overlay helpers to Vishot's generic Electron context.
 */
export function createStageTamagotchiScenarioContext(context: ScenarioContext): StageTamagotchiScenarioContext {
  return {
    ...context,
    controlsIsland: {
      async expand(page) {
        await expandControlsIsland(page)
      },
      async openChat(page) {
        await openChatFromControlsIsland(page)
        return waitForStageWindow(context.electronApp, 'chat')
      },
      openHearing(page) {
        return openHearingFromControlsIsland(page)
      },
      async openSettings(page) {
        await openSettingsFromControlsIsland(page)
        return waitForStageWindow(context.electronApp, 'settings')
      },
      waitForReady(page) {
        return waitForControlsIslandReady(page)
      },
    },
    dialogs: {
      dismiss(page) {
        return dismissDialog(page)
      },
    },
    drawers: {
      dismiss(page) {
        return dismissDrawer(page)
      },
      swipeDown(page) {
        return swipeDownDrawer(page)
      },
    },
    settingsWindow: {
      goToConnection(page) {
        return goToSettingsConnectionPage(page)
      },
      goToRoute(page, routePath) {
        return goToSettingsRoute(page, routePath)
      },
      waitFor(timeout) {
        return waitForStageWindow(context.electronApp, 'settings', timeout)
      },
    },
    stageWindows: {
      waitFor(name, timeout) {
        return waitForStageWindow(context.electronApp, name, timeout)
      },
    },
  }
}

/**
 * Defines an AIRI stage-tamagotchi Electron scenario for Vishot's generic source runner.
 */
export function defineStageTamagotchiScenario(scenario: StageTamagotchiScenario): ElectronScenario {
  return defineScenario({
    id: scenario.id,
    run(context) {
      return scenario.run(createStageTamagotchiScenarioContext(context))
    },
  })
}
