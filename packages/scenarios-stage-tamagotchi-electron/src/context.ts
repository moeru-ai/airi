import type { ElectronScenario, ScenarioContext } from '@vishot/source-electron'
import type { Page } from 'playwright'

import type { StageWindowName, StageWindowSnapshot } from './runtime/windows.ts'

import { defineScenario } from '@vishot/source-electron'

import { dismissDialog, dismissDrawer, swipeDownDrawer } from './runtime/overlays.ts'
import { expandControlsIsland, openChatFromControlsIsland, openHearingFromControlsIsland, openSettingsFromControlsIsland, waitForControlsIslandReady } from './runtime/selectors.ts'
import { goToSettingsConnectionPage, goToSettingsRoute } from './runtime/settings.ts'
import { waitForStageWindow } from './runtime/windows.ts'

export interface StageWindowsApi {
  waitFor: (name: StageWindowName, timeout?: number) => Promise<StageWindowSnapshot>
}

export interface ControlsIslandApi {
  waitForReady: (page: Page) => Promise<void>
  expand: (page: Page) => Promise<void>
  openSettings: (page: Page) => Promise<StageWindowSnapshot>
  openChat: (page: Page) => Promise<StageWindowSnapshot>
  openHearing: (page: Page) => Promise<Page>
}

export interface SettingsWindowApi {
  waitFor: (timeout?: number) => Promise<StageWindowSnapshot>
  goToConnection: (page: Page) => Promise<Page>
  goToRoute: (page: Page, routePath: string) => Promise<Page>
}

export interface DialogsApi {
  dismiss: (page: Page) => Promise<void>
}

export interface DrawersApi {
  swipeDown: (page: Page) => Promise<void>
  dismiss: (page: Page) => Promise<void>
}

/**
 * Generic Vishot Electron context plus AIRI stage-tamagotchi navigation helpers.
 */
export interface StageTamagotchiScenarioContext extends ScenarioContext {
  stageWindows: StageWindowsApi
  controlsIsland: ControlsIslandApi
  settingsWindow: SettingsWindowApi
  dialogs: DialogsApi
  drawers: DrawersApi
}

export interface StageTamagotchiScenario {
  id: string
  run: (context: StageTamagotchiScenarioContext) => Promise<void>
}

/**
 * Adds AIRI-specific window and overlay helpers to Vishot's generic Electron context.
 */
export function createStageTamagotchiScenarioContext(context: ScenarioContext): StageTamagotchiScenarioContext {
  return {
    ...context,
    stageWindows: {
      waitFor(name, timeout) {
        return waitForStageWindow(context.electronApp, name, timeout)
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
        return waitForStageWindow(context.electronApp, 'settings')
      },
      async openChat(page) {
        await openChatFromControlsIsland(page)
        return waitForStageWindow(context.electronApp, 'chat')
      },
      openHearing(page) {
        return openHearingFromControlsIsland(page)
      },
    },
    settingsWindow: {
      waitFor(timeout) {
        return waitForStageWindow(context.electronApp, 'settings', timeout)
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
